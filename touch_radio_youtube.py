#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TC Radio - Complete Working Version
For fresh Raspberry Pi OS install
"""

import os
import sys
import time
import json
import math
import socket
import threading
import base64
import io
import subprocess
import shlex
from datetime import datetime, timedelta
from urllib.request import urlopen

from flask import Flask, render_template_string, Response, jsonify, request
import pygame
import vlc
import requests
import qrcode

try:
    import yt_dlp
    YTDLP_AVAILABLE = True
except ImportError:
    YTDLP_AVAILABLE = False
    print("WARNING: yt-dlp not installed")

try:
    from PIL import Image, ImageDraw
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False

# ============================================================================
# CONFIGURATION
# ============================================================================

APP_VERSION = "3.0"
DEFAULT_PORT = 8080
STATIONS_URL = "https://raw.githubusercontent.com/simsonpeter/Tcradios/main/stations.json"
WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=50.83&longitude=-0.17&current_weather=true"

CONFIG_DIR = os.path.expanduser("~/.config/tcradio")
os.makedirs(CONFIG_DIR, exist_ok=True)
LAST_STATION_FILE = os.path.join(CONFIG_DIR, "last_station")
ALARM_FILE = os.path.join(CONFIG_DIR, "alarm.json")
SLEEP_FILE = os.path.join(CONFIG_DIR, "sleep.json")
THEME_FILE = os.path.join(CONFIG_DIR, "theme.json")

# ============================================================================
# YOUTUBE FUNCTIONS
# ============================================================================

youtube_playing = False
youtube_current_title = ""
youtube_current_url = ""

def get_youtube_audio_url(youtube_url):
    """Extract direct audio URL from YouTube video"""
    if not YTDLP_AVAILABLE:
        return None, None
    
    try:
        ydl_opts = {
            'format': 'bestaudio/best',
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(youtube_url, download=False)
            if 'url' in info:
                return info['url'], info.get('title', 'Unknown')
            elif 'formats' in info and len(info['formats']) > 0:
                audio_formats = [f for f in info['formats'] 
                               if f.get('acodec') != 'none']
                if audio_formats:
                    best_audio = max(audio_formats, 
                                   key=lambda x: x.get('abr', 0) or 0)
                    return best_audio['url'], info.get('title', 'Unknown')
    except Exception as e:
        print(f"Error extracting YouTube audio: {e}")
    return None, None

def search_youtube_videos(query, max_results=10):
    """Search YouTube videos"""
    if not YTDLP_AVAILABLE:
        return []
    
    try:
        search_query = f"ytsearch{max_results}:{query}"
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            results = ydl.extract_info(search_query, download=False)
            if 'entries' in results:
                videos = []
                for entry in results['entries']:
                    if entry:
                        videos.append({
                            'id': entry.get('id', ''),
                            'title': entry.get('title', 'Unknown'),
                            'channel': entry.get('channel', entry.get('uploader', 'Unknown')),
                            'duration': entry.get('duration_string', '0:00'),
                            'thumbnail': entry.get('thumbnail', ''),
                            'url': f"https://www.youtube.com/watch?v={entry.get('id')}"
                        })
                return videos
    except Exception as e:
        print(f"Error searching YouTube: {e}")
    return []

# ============================================================================
# NETWORK & UTILS
# ============================================================================

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(2)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        try:
            result = subprocess.run(['hostname', '-I'], capture_output=True, text=True)
            if result.stdout:
                return result.stdout.strip().split()[0]
        except:
            pass
    return "192.168.1.100"

current_ip = get_local_ip()

# ============================================================================
# ALARM & SLEEP TIMER
# ============================================================================

class SmartAlarm:
    def __init__(self):
        self.alarm_enabled = False
        self.alarm_time = "07:00"
        self.alarm_station_idx = 0
        self.alarm_volume_start = 20
        self.alarm_volume_end = 60
        self.alarm_fade_duration = 300
        self.alarm_days = [True, True, True, True, True, False, False]
        self.sleep_timer_enabled = False
        self.sleep_duration = 1800
        self.sleep_start_time = 0
        self.sleep_volume_fade = True
        self.sleep_stop_method = "pause"
        self.load_settings()
    
    def load_settings(self):
        try:
            if os.path.exists(ALARM_FILE):
                with open(ALARM_FILE, 'r') as f:
                    data = json.load(f)
                    self.alarm_enabled = data.get('enabled', False)
                    self.alarm_time = data.get('time', "07:00")
                    self.alarm_station_idx = data.get('station_idx', 0)
                    self.alarm_volume_start = data.get('volume_start', 20)
                    self.alarm_volume_end = data.get('volume_end', 60)
                    self.alarm_fade_duration = data.get('fade_duration', 300)
                    self.alarm_days = data.get('days', [True]*5 + [False]*2)
        except Exception as e:
            print(f"Alarm load error: {e}")
        
        try:
            if os.path.exists(SLEEP_FILE):
                with open(SLEEP_FILE, 'r') as f:
                    data = json.load(f)
                    self.sleep_duration = data.get('duration', 1800)
                    self.sleep_volume_fade = data.get('volume_fade', True)
                    self.sleep_stop_method = data.get('stop_method', "pause")
        except Exception as e:
            print(f"Sleep load error: {e}")
    
    def save_alarm_settings(self):
        try:
            data = {
                'enabled': self.alarm_enabled,
                'time': self.alarm_time,
                'station_idx': self.alarm_station_idx,
                'volume_start': self.alarm_volume_start,
                'volume_end': self.alarm_volume_end,
                'fade_duration': self.alarm_fade_duration,
                'days': self.alarm_days
            }
            with open(ALARM_FILE, 'w') as f:
                json.dump(data, f)
        except Exception as e:
            print(f"Alarm save error: {e}")
    
    def save_sleep_settings(self):
        try:
            data = {
                'duration': self.sleep_duration,
                'volume_fade': self.sleep_volume_fade,
                'stop_method': self.sleep_stop_method
            }
            with open(SLEEP_FILE, 'w') as f:
                json.dump(data, f)
        except Exception as e:
            print(f"Sleep save error: {e}")
    
    def check_alarm(self):
        if not self.alarm_enabled:
            return False
        now = datetime.now()
        current_time = now.strftime("%H:%M")
        current_weekday = now.weekday()
        if (current_time == self.alarm_time and 
            self.alarm_days[current_weekday] and
            not self.sleep_timer_enabled):
            return True
        return False
    
    def start_sleep_timer(self, duration_minutes=None):
        if duration_minutes:
            self.sleep_duration = duration_minutes * 60
        self.sleep_timer_enabled = True
        self.sleep_start_time = time.time()
        print(f"Sleep timer started for {self.sleep_duration//60} minutes")
    
    def stop_sleep_timer(self):
        self.sleep_timer_enabled = False
        print("Sleep timer stopped")
    
    def check_sleep_timer(self):
        if not self.sleep_timer_enabled:
            return False
        elapsed = time.time() - self.sleep_start_time
        if elapsed >= self.sleep_duration:
            self.sleep_timer_enabled = False
            return True
        return False
    
    def get_sleep_remaining(self):
        if not self.sleep_timer_enabled:
            return 0
        elapsed = time.time() - self.sleep_start_time
        remaining = max(0, self.sleep_duration - elapsed)
        return int(remaining // 60)

alarm_system = SmartAlarm()

# ============================================================================
# THEME SYSTEM
# ============================================================================

class Theme:
    def __init__(self, name, colors):
        self.name = name
        self.colors = colors
        self.background = colors.get('background', '#000000')
        self.primary = colors.get('primary', '#00d2ff')
        self.secondary = colors.get('secondary', '#9d50bb')
        self.accent = colors.get('accent', '#ffcc00')
        self.text = colors.get('text', '#ffffff')
        self.card = colors.get('card', 'rgba(20,20,20,0.95)')
        self.button = colors.get('button', 'rgba(30,30,30,0.95)')
        self.button_hover = colors.get('button_hover', 'rgba(50,50,50,0.95)')
        self.gradient_start = colors.get('gradient_start', '#000000')
        self.gradient_end = colors.get('gradient_end', '#000000')
        self.pygame_primary = self.hex_to_rgb(self.primary)
        self.pygame_secondary = self.hex_to_rgb(self.secondary)
        self.pygame_accent = self.hex_to_rgb(self.accent)
        self.pygame_text = self.hex_to_rgb(self.text)
        self.pygame_background = self.hex_to_rgb(self.background)
    
    def hex_to_rgb(self, hex_color):
        hex_color = hex_color.lstrip('#')
        if len(hex_color) != 6:
            return (255, 255, 255)
        try:
            return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
        except:
            return (255, 255, 255)

THEMES = {
    'true_black': Theme('True Black', {
        'name': 'True Black',
        'background': '#000000',
        'primary': '#00d2ff',
        'secondary': '#9d50bb',
        'accent': '#ffcc00',
        'text': '#ffffff',
        'card': 'rgba(20,20,20,0.95)',
        'button': 'rgba(30,30,30,0.95)',
        'button_hover': 'rgba(50,50,50,0.95)',
        'gradient_start': '#000000',
        'gradient_end': '#000000'
    }),
    'midnight_black': Theme('Midnight Black', {
        'name': 'Midnight Black',
        'background': '#0a0a0a',
        'primary': '#00d2ff',
        'secondary': '#9d50bb',
        'accent': '#ffcc00',
        'text': '#ffffff',
        'gradient_start': '#0a0a0a',
        'gradient_end': '#1a1a1a'
    }),
    'ocean_blue': Theme('Ocean Blue', {
        'name': 'Ocean Blue',
        'background': '#0f3460',
        'primary': '#00d2ff',
        'secondary': '#1e90ff',
        'accent': '#ff6b6b',
        'text': '#ffffff',
        'gradient_start': '#0f3460',
        'gradient_end': '#16213e'
    }),
    'cyberpunk': Theme('Cyberpunk', {
        'name': 'Cyberpunk',
        'background': '#0d0221',
        'primary': '#ff00ff',
        'secondary': '#00ffff',
        'accent': '#ff6b00',
        'text': '#ffffff',
        'gradient_start': '#0d0221',
        'gradient_end': '#2d00aa'
    }),
}

current_theme = THEMES['true_black']

def load_theme():
    global current_theme
    try:
        if os.path.exists(THEME_FILE):
            with open(THEME_FILE, 'r') as f:
                theme_name = f.read().strip()
                if theme_name in THEMES:
                    current_theme = THEMES[theme_name]
    except:
        current_theme = THEMES['true_black']

def save_theme(theme_name):
    try:
        with open(THEME_FILE, 'w') as f:
            f.write(theme_name)
    except:
        pass

load_theme()

# ============================================================================
# FLASK APP & HTML TEMPLATE
# ============================================================================

app = Flask(__name__)

@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    return response

HTML_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <title>TC Radio Remote v3</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <meta name="theme-color" content="{{ theme.primary }}">
    <style>
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; margin: 0; padding: 0; }
        body { background: {{ theme.background }}; color: {{ theme.text }}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; min-height: 100vh; }
        .app-header { background: rgba(0,0,0,0.95); padding: 15px; text-align: center; border-bottom: 2px solid {{ theme.primary }}; }
        .header-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 10px; }
        .app-title { color: {{ theme.primary }}; font-size: 22px; font-weight: bold; }
        .connection-status { font-size: 12px; background: rgba(0,255,0,0.2); color: #00ff00; padding: 4px 10px; border-radius: 10px; }
        .disconnect-btn { background: rgba(255,50,50,0.2); border: 1px solid rgba(255,50,50,0.5); color: #ff5050; padding: 6px 12px; border-radius: 10px; font-size: 12px; cursor: pointer; }
        .tabs-container { display: flex; background: rgba(0,0,0,0.95); border-bottom: 1px solid {{ theme.primary }}; overflow-x: auto; }
        .tab-button { flex: 1; padding: 12px 8px; background: transparent; border: none; color: rgba(255,255,255,0.7); font-size: 11px; font-weight: 600; cursor: pointer; white-space: nowrap; min-width: 60px; }
        .tab-button.active { color: {{ theme.primary }}; border-bottom: 3px solid {{ theme.primary }}; }
        .tab-content { display: none; padding: 15px; background: {{ theme.background }}; min-height: calc(100vh - 150px); }
        .tab-content.active { display: block; }
        .now-playing-card { background: {{ theme.card }}; padding: 15px; border-radius: 12px; margin-bottom: 20px; border-left: 4px solid {{ theme.primary }}; text-align: center; }
        .now-playing-title { font-size: 12px; color: rgba(255,255,255,0.8); margin-bottom: 5px; text-transform: uppercase; }
        .now-playing-text { font-size: 16px; font-weight: bold; color: {{ theme.primary }}; }
        .control-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
        .control-btn { background: {{ theme.button }}; border: 1px solid {{ theme.primary }}; color: {{ theme.text }}; padding: 20px 10px; border-radius: 12px; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 8px; }
        .control-btn-large { grid-column: span 2; }
        .volume-section { background: {{ theme.card }}; padding: 15px; border-radius: 12px; margin-bottom: 20px; }
        .volume-bar-container { background: rgba(0,0,0,0.5); height: 8px; border-radius: 4px; overflow: hidden; margin: 15px 0; }
        .volume-bar { height: 100%; background: linear-gradient(90deg, {{ theme.primary }}, {{ theme.secondary }}); border-radius: 4px; transition: width 0.3s; }
        .station-list { display: flex; flex-direction: column; gap: 10px; }
        .station-item { background: {{ theme.card }}; border-radius: 12px; padding: 12px; display: flex; align-items: center; cursor: pointer; border: 1px solid transparent; }
        .station-item.current { border-color: {{ theme.primary }}; background: rgba(0,210,255,0.1); }
        .station-logo { width: 50px; height: 50px; border-radius: 50%; object-fit: cover; border: 2px solid {{ theme.primary }}; margin-right: 15px; }
        .station-name { font-weight: 600; font-size: 16px; color: {{ theme.text }}; }
        .youtube-search-box { display: flex; gap: 10px; margin-bottom: 15px; }
        .youtube-input { flex: 1; padding: 15px; border-radius: 10px; border: 2px solid {{ theme.primary }}; background: rgba(0,0,0,0.7); color: {{ theme.text }}; font-size: 16px; }
        .youtube-btn { background: {{ theme.button }}; border: 2px solid {{ theme.primary }}; color: {{ theme.text }}; padding: 15px 20px; border-radius: 15px; font-size: 16px; cursor: pointer; }
        .youtube-result { background: {{ theme.card }}; border-radius: 12px; padding: 12px; display: flex; align-items: center; gap: 12px; margin-bottom: 10px; cursor: pointer; }
        .youtube-thumb { width: 80px; height: 60px; border-radius: 8px; object-fit: cover; }
        .youtube-title { font-weight: 600; font-size: 14px; color: {{ theme.text }}; }
        .youtube-channel { font-size: 12px; color: rgba(255,255,255,0.6); }
        .now-playing-youtube { background: {{ theme.card }}; padding: 15px; border-radius: 12px; border-left: 4px solid {{ theme.accent }}; margin-top: 15px; }
        .stop-btn { width: 100%; background: rgba(255,50,50,0.2); border: 1px solid rgba(255,50,50,0.5); color: #ff5050; padding: 15px; border-radius: 12px; margin-top: 10px; cursor: pointer; }
    </style>
</head>
<body>
    <div class="app-header">
        <div class="header-top">
            <div class="app-title">🎵 TC RADIO</div>
            <div style="display: flex; gap: 10px; align-items: center;">
                <div class="connection-status">● Connected</div>
                <button class="disconnect-btn" onclick="location.reload()">Refresh</button>
            </div>
        </div>
        <div style="font-size: 12px; color: rgba(255,255,255,0.7);">{{ ip_address }}:8080 | v3.0 | YT:✓</div>
    </div>
    
    <div class="tabs-container">
        <button class="tab-button active" onclick="switchTab('controller', this)">🎮 Control</button>
        <button class="tab-button" onclick="switchTab('radios', this)">📻 Radios</button>
        <button class="tab-button" onclick="switchTab('speak', this)">🗣️ Speak</button>
        <button class="tab-button" onclick="switchTab('youtube', this)">📺 YouTube</button>
        <button class="tab-button" onclick="switchTab('themes', this)">🎨 Themes</button>
    </div>
    
    <div id="controller-tab" class="tab-content active">
        <div class="now-playing-card">
            <div class="now-playing-title">Now Playing</div>
            <div class="now-playing-text" id="now-playing">{{ now_playing }}</div>
        </div>
        <div class="control-grid">
            <button class="control-btn" onclick="sendCmd('prev')">⏮ Previous</button>
            <button class="control-btn" onclick="sendCmd('next')">⏭ Next</button>
            <button class="control-btn control-btn-large" onclick="sendCmd('toggle')">⏯ Play / Pause</button>
            <button class="control-btn control-btn-large" onclick="sendCmd('mute')">🔇 Mute / Unmute</button>
        </div>
        <div class="volume-section">
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                <span style="color: {{ theme.primary }}; font-weight: bold;">Volume</span>
                <span style="color: {{ theme.primary }};" id="vol-display">{{ vol_level }}%</span>
            </div>
            <div class="volume-bar-container">
                <div class="volume-bar" id="vol-bar" style="width: {{ vol_level }}%;"></div>
            </div>
            <div class="control-grid">
                <button class="control-btn" onclick="sendCmd('voldown')">🔉 -10</button>
                <button class="control-btn" onclick="sendCmd('volup')">🔊 +10</button>
            </div>
        </div>
    </div>
    
    <div id="radios-tab" class="tab-content">
        <h3 style="color: {{ theme.primary }}; margin-bottom: 15px;">📻 Stations</h3>
        <div class="station-list">
            {% for s in stations %}
            <div class="station-item {% if loop.index0 == current_idx %}current{% endif %}" onclick="playStation({{ loop.index0 }})">
                <div class="station-logo" style="background: {{ theme.primary }}; display: flex; align-items: center; justify-content: center; color: #000; font-weight: bold;">{{ s.name[:2] }}</div>
                <div>
                    <div class="station-name">{{ s.name }}</div>
                    <div class="youtube-channel">{{ s.genre or 'Radio' }}</div>
                </div>
            </div>
            {% endfor %}
        </div>
    </div>
    
    <div id="speak-tab" class="tab-content">
        <h3 style="color: {{ theme.primary }}; margin-bottom: 15px;">🗣️ Text to Speech</h3>
        <textarea id="speak-text" style="width: 100%; padding: 15px; border-radius: 10px; border: 2px solid {{ theme.primary }}; background: rgba(0,0,0,0.7); color: {{ theme.text }}; font-size: 16px; min-height: 100px; margin-bottom: 15px;" placeholder="Type something to say..."></textarea>
        <button class="control-btn control-btn-large" onclick="speak()">📢 Speak</button>
    </div>
    
    <div id="youtube-tab" class="tab-content">
        <h3 style="color: {{ theme.primary }}; margin-bottom: 15px;">📺 YouTube Audio</h3>
        <div class="youtube-search-box">
            <input type="text" id="yt-search" class="youtube-input" placeholder="Search YouTube...">
            <button class="youtube-btn" onclick="searchYouTube()">🔍</button>
        </div>
        <div class="youtube-search-box">
            <input type="text" id="yt-url" class="youtube-input" placeholder="Or paste YouTube URL...">
            <button class="youtube-btn" onclick="playYouTubeUrl()">▶️</button>
        </div>
        <div id="yt-results"></div>
        <div id="yt-now-playing" class="now-playing-youtube" style="display: none;">
            <div style="font-size: 12px; color: rgba(255,255,255,0.8);">Now Playing</div>
            <div id="yt-title" style="font-size: 14px; font-weight: bold; color: {{ theme.primary }}; margin-top: 5px;"></div>
            <button class="stop-btn" onclick="stopYouTube()">⏹ Stop</button>
        </div>
    </div>
    
    <div id="themes-tab" class="tab-content">
        <h3 style="color: {{ theme.primary }}; margin-bottom: 15px;">🎨 Themes</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            {% for key, t in all_themes.items() %}
            <button class="control-btn" onclick="setTheme('{{ key }}')" style="background: {{ t.gradient_start }};">
                {{ t.name }}
            </button>
            {% endfor %}
        </div>
    </div>
    
    <script>
        let currentStation = {{ current_idx }};
        let currentVol = {{ vol_level }};
        
        function switchTab(tab, btn) {
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            document.getElementById(tab + '-tab').classList.add('active');
            btn.classList.add('active');
        }
        
        function sendCmd(cmd) {
            fetch('/api/' + cmd).then(() => {
                if (cmd.includes('vol')) updateVolume();
                if (['prev','next','toggle'].includes(cmd)) setTimeout(updateNowPlaying, 200);
            });
        }
        
        function playStation(idx) {
            fetch('/api/play/' + idx).then(() => {
                currentStation = idx;
                updateNowPlaying();
                switchTab('controller', document.querySelector('.tab-button'));
            });
        }
        
        function updateVolume() {
            fetch('/api/volume').then(r => r.json()).then(data => {
                currentVol = data.volume;
                document.getElementById('vol-bar').style.width = data.volume + '%';
                document.getElementById('vol-display').textContent = data.volume + '%';
            });
        }
        
        function updateNowPlaying() {
            fetch('/api/nowplaying').then(r => r.json()).then(data => {
                document.getElementById('now-playing').textContent = data.text;
            });
        }
        
        function speak() {
            const text = document.getElementById('speak-text').value;
            if (!text) return;
            fetch('/api/speak', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({text: text})
            }).then(() => {
                document.getElementById('speak-text').value = '';
            });
        }
        
        function searchYouTube() {
            const query = document.getElementById('yt-search').value.trim();
            if (!query) return alert('Enter search term');
            
            fetch('/api/youtube/search', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({query: query})
            })
            .then(r => r.json())
            .then(data => {
                if (data.success) showYouTubeResults(data.results);
                else alert('Search failed: ' + (data.error || 'Unknown'));
            })
            .catch(err => alert('Error: ' + err));
        }
        
        function showYouTubeResults(results) {
            const container = document.getElementById('yt-results');
            if (!results || results.length === 0) {
                container.innerHTML = '<div style="color: #ff5050;">No results found</div>';
                return;
            }
            container.innerHTML = results.map(v => `
                <div class="youtube-result" onclick="playYouTube('${v.url}', '${v.title.replace(/'/g, "\\'")}')">
                    <img src="${v.thumbnail}" class="youtube-thumb" onerror="this.style.display='none'">
                    <div>
                        <div class="youtube-title">${v.title}</div>
                        <div class="youtube-channel">${v.channel} • ${v.duration}</div>
                    </div>
                </div>
            `).join('');
        }
        
        function playYouTubeUrl() {
            const url = document.getElementById('yt-url').value.trim();
            if (!url) return alert('Enter YouTube URL');
            playYouTube(url, 'YouTube Video');
        }
        
        function playYouTube(url, title) {
            fetch('/api/youtube/play', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({url: url, title: title})
            })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    document.getElementById('yt-now-playing').style.display = 'block';
                    document.getElementById('yt-title').textContent = data.title;
                    updateNowPlaying();
                } else {
                    alert('Failed to play: ' + (data.error || 'Cannot extract audio'));
                }
            })
            .catch(err => alert('Error: ' + err));
        }
        
        function stopYouTube() {
            fetch('/api/youtube/stop', {method: 'POST'}).then(() => {
                document.getElementById('yt-now-playing').style.display = 'none';
                updateNowPlaying();
            });
        }
        
        function setTheme(themeName) {
            fetch('/api/theme/' + themeName).then(() => location.reload());
        }
        
        setInterval(() => {
            updateNowPlaying();
            updateVolume();
        }, 3000);
    </script>
</body>
</html>
"""

# ============================================================================
# FLASK ROUTES
# ============================================================================

stations = []
current_idx = 0
vol_level = 80
meta_text = ""

@app.route('/')
def home():
    global meta_text, stations, current_idx, vol_level
    return render_template_string(
        HTML_TEMPLATE,
        stations=stations,
        ip_address=current_ip,
        vol_level=vol_level,
        current_idx=current_idx,
        now_playing=meta_text if meta_text else (stations[current_idx]['name'] if stations else "No Station"),
        theme=current_theme,
        all_themes=THEMES
    )

@app.route('/api/<action>')
def api_action(action):
    global current_idx, vol_level, player, stations, meta_text
    try:
        if action == 'next':
            current_idx = (current_idx + 1) % len(stations)
            play_station()
        elif action == 'prev':
            current_idx = (current_idx - 1) % len(stations)
            play_station()
        elif action == 'volup':
            vol_level = min(vol_level + 10, 100)
            if player: player.audio_set_volume(vol_level)
        elif action == 'voldown':
            vol_level = max(vol_level - 10, 0)
            if player: player.audio_set_volume(vol_level)
        elif action == 'toggle':
            if player: player.pause()
        elif action == 'mute':
            vol_level = 0 if vol_level > 0 else 80
            if player: player.audio_set_volume(vol_level)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/play/<int:idx>')
def play_index(idx):
    global current_idx
    try:
        current_idx = idx % len(stations)
        play_station()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/volume')
def get_volume():
    return jsonify({'volume': vol_level})

@app.route('/api/nowplaying')
def get_now_playing():
    return jsonify({'text': meta_text if meta_text else (stations[current_idx]['name'] if stations else "No Station")})

@app.route('/api/speak', methods=['POST'])
def api_speak():
    global player, vol_level
    try:
        data = request.get_json()
        text = data.get('text', '')
        if text and player:
            orig_vol = vol_level
            player.audio_set_volume(int(orig_vol * 0.3))
            subprocess.Popen(['espeak', '-v', 'en', text])
            threading.Timer(2.0, lambda: player.audio_set_volume(orig_vol)).start()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/theme/<theme_name>')
def set_theme_route(theme_name):
    global current_theme
    if theme_name in THEMES:
        current_theme = THEMES[theme_name]
        save_theme(theme_name)
    return jsonify({'success': True})

# YouTube Routes
@app.route('/api/youtube/search', methods=['POST'])
def youtube_search_route():
    try:
        data = request.get_json()
        query = data.get('query', '') if data else ''
        if not query:
            return jsonify({'success': False, 'error': 'No query provided'})
        results = search_youtube_videos(query, max_results=10)
        return jsonify({'success': True, 'results': results})
    except Exception as e:
        print(f"YouTube search error: {e}")
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/youtube/play', methods=['POST'])
def youtube_play_route():
    global player, instance, youtube_playing, youtube_current_title, youtube_current_url, meta_text, vol_level
    try:
        data = request.get_json()
        url = data.get('url', '') if data else ''
        title = data.get('title', 'YouTube Video') if data else 'YouTube Video'
        
        if not url:
            return jsonify({'success': False, 'error': 'No URL provided'})
        
        print(f"Extracting audio from: {url}")
        audio_url, video_title = get_youtube_audio_url(url)
        
        if not audio_url:
            return jsonify({'success': False, 'error': 'Could not extract audio. Video may be restricted.'})
        
        if player:
            player.stop()
        
        media = instance.media_new(audio_url)
        player.set_media(media)
        player.play()
        player.audio_set_volume(vol_level)
        
        youtube_playing = True
        youtube_current_title = video_title or title
        youtube_current_url = url
        meta_text = f"YOUTUBE: {youtube_current_title}"
        
        return jsonify({'success': True, 'title': youtube_current_title})
    except Exception as e:
        print(f"YouTube play error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/youtube/stop', methods=['POST'])
def youtube_stop_route():
    global youtube_playing, youtube_current_title, youtube_current_url, meta_text
    try:
        if player:
            player.stop()
        youtube_playing = False
        youtube_current_title = ""
        youtube_current_url = ""
        meta_text = ""
        if stations:
            play_station()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

# ============================================================================
# RADIO PLAYER
# ============================================================================

def load_stations():
    global stations
    try:
        response = requests.get(STATIONS_URL, timeout=10)
        stations = response.json()
        print(f"Loaded {len(stations)} stations")
    except Exception as e:
        print(f"Error loading stations: {e}")
        stations = [
            {"name": "BBC Radio 1", "url": "http://stream.live.vc.bbcmedia.co.uk/bbc_radio_one", "genre": "Pop"},
            {"name": "BBC Radio 2", "url": "http://stream.live.vc.bbcmedia.co.uk/bbc_radio_two", "genre": "Adult Contemporary"},
        ]

def play_station():
    global meta_text, current_idx, vol_level, player, instance
    if not stations or current_idx >= len(stations):
        return
    
    station = stations[current_idx]
    try:
        player.set_media(instance.media_new(station['url']))
        player.play()
        player.audio_set_volume(vol_level)
        meta_text = station['name'].upper()
        
        # Save last station
        with open(LAST_STATION_FILE, 'w') as f:
            f.write(str(current_idx))
    except Exception as e:
        print(f"Error playing station: {e}")

def run_flask():
    app.run(host='0.0.0.0', port=DEFAULT_PORT, debug=False, use_reloader=False, threaded=True)

# ============================================================================
# PYGAME DISPLAY
# ============================================================================

def init_display():
    global screen, f_lg, f_sm, f_xl, f_med, f_tiny, player, instance
    
    os.environ['SDL_VIDEODRIVER'] = 'x11'
    os.environ['DISPLAY'] = ':0'
    
    try:
        pygame.init()
        screen = pygame.display.set_mode((320, 480), pygame.FULLSCREEN | pygame.NOFRAME)
        print("Fullscreen mode set")
    except:
        try:
            screen = pygame.display.set_mode((320, 480))
            print("Windowed mode set")
        except:
            screen = None
            print("No display available")
    
    if screen is None:
        screen = pygame.Surface((320, 480))
    
    try:
        f_lg = pygame.font.SysFont("dejavusans", 24, bold=True)
        f_sm = pygame.font.SysFont("dejavusans", 16, bold=True)
        f_xl = pygame.font.SysFont("dejavusans", 80, bold=True)
        f_med = pygame.font.SysFont("dejavusans", 24, bold=True)
        f_tiny = pygame.font.SysFont("dejavusans", 12, bold=True)
    except:
        f_lg = pygame.font.Font(None, 24)
        f_sm = pygame.font.Font(None, 16)
        f_xl = pygame.font.Font(None, 80)
        f_med = pygame.font.Font(None, 24)
        f_tiny = pygame.font.Font(None, 12)
    
    instance = vlc.Instance('--no-video')
    player = instance.media_player_new()

def draw_interface():
    # Simplified display - just show status
    screen.fill((0, 0, 0))
    
    # Header
    pygame.draw.rect(screen, current_theme.pygame_primary, (0, 0, 320, 60))
    title = f_lg.render("TC RADIO", True, (0, 0, 0))
    screen.blit(title, (100, 15))
    
    # IP Address
    ip_text = f_sm.render(f"IP: {current_ip}:8080", True, current_theme.pygame_accent)
    screen.blit(ip_text, (10, 70))
    
    # Now Playing
    now_text = f_med.render("NOW PLAYING:", True, current_theme.pygame_primary)
    screen.blit(now_text, (10, 120))
    
    station_name = meta_text if meta_text else (stations[current_idx]['name'] if stations else "No Station")
    name_surf = f_lg.render(station_name[:20], True, current_theme.pygame_text)
    screen.blit(name_surf, (10, 150))
    
    # Volume
    vol_text = f_med.render(f"Volume: {vol_level}%", True, current_theme.pygame_text)
    screen.blit(vol_text, (10, 250))
    
    # Controls hint
    hint = f_tiny.render("Click: Play/Pause | Arrows: Change Station", True, (100, 100, 100))
    screen.blit(hint, (10, 400))
    
    pygame.display.flip()

def handle_events():
    global running, current_idx, vol_level
    
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        elif event.type == pygame.MOUSEBUTTONDOWN:
            x, y = event.pos
            # Simple touch areas
            if y > 300:  # Bottom half = play/pause
                player.pause()
            elif x < 160:  # Left side = prev
                current_idx = (current_idx - 1) % len(stations)
                play_station()
            else:  # Right side = next
                current_idx = (current_idx + 1) % len(stations)
                play_station()

# ============================================================================
# MAIN
# ============================================================================

def main():
    global running, current_idx
    
    print(f"\n{'='*50}")
    print(f"🚀 TC RADIO v{APP_VERSION}")
    print(f"{'='*50}")
    print(f"📱 OPEN: http://{current_ip}:{DEFAULT_PORT}")
    print(f"{'='*50}\n")
    
    # Load stations
    load_stations()
    
    # Load last station
    global current_idx
    if os.path.exists(LAST_STATION_FILE):
        try:
            with open(LAST_STATION_FILE, 'r') as f:
                saved = int(f.read())
                if 0 <= saved < len(stations):
                    current_idx = saved
        except:
            pass
    
    # Init display and player
    init_display()
    
    # Start Flask in background
    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()
    
    # Play first station
    play_station()
    
    # Main loop
    running = True
    clock = pygame.time.Clock()
    
    while running:
        try:
            handle_events()
            draw_interface()
            clock.tick(30)
        except KeyboardInterrupt:
            running = False
        except Exception as e:
            print(f"Main loop error: {e}")
            time.sleep(1)
    
    # Cleanup
    try:
        pygame.quit()
        player.stop()
    except:
        pass
    print("Radio stopped")

if __name__ == '__main__':
    main()
