#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TC Radio v3.1 - Fixed Version
- Fixed YouTube search (404 errors)
- Fixed slow search (added caching)
- Fixed playback issues
- Better error handling
- Cleaner code structure
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
import re
from datetime import datetime, timedelta
from urllib.request import urlopen
from functools import lru_cache

# Flask
from flask import Flask, render_template_string, Response, jsonify, request

# Pygame
import pygame

# VLC
import vlc

# Other modules
import requests
import qrcode

# yt-dlp with better error handling
try:
    import yt_dlp
    YTDLP_AVAILABLE = True
    print("✓ yt-dlp loaded successfully")
except ImportError as e:
    YTDLP_AVAILABLE = False
    print(f"✗ yt-dlp not available: {e}")

try:
    from PIL import Image, ImageDraw
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False
    print("✗ PIL not available")

# ============================================================================
# CONFIGURATION
# ============================================================================

APP_VERSION = "3.1"
DEFAULT_PORT = 8080
STATIONS_URL = "https://raw.githubusercontent.com/simsonpeter/Tcradios/main/stations.json"
WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=50.83&longitude=-0.17&current_weather=true"

# File paths
CONFIG_DIR = os.path.expanduser("~/.config/tcradio")
os.makedirs(CONFIG_DIR, exist_ok=True)
LAST_STATION_FILE = os.path.join(CONFIG_DIR, "last_station")
ALARM_FILE = os.path.join(CONFIG_DIR, "alarm.json")
SLEEP_FILE = os.path.join(CONFIG_DIR, "sleep.json")
THEME_FILE = os.path.join(CONFIG_DIR, "theme.json")

# Global state
youtube_playing = False
youtube_current_title = ""
youtube_current_url = ""

# ============================================================================
# YOUTUBE FUNCTIONS - FIXED
# ============================================================================

def get_youtube_audio_url(youtube_url):
    """
    Extract direct audio URL from YouTube video
    FIXED: Better format selection and error handling
    """
    if not YTDLP_AVAILABLE:
        print("ERROR: yt-dlp not installed")
        return None, None
    
    # Validate URL
    if not youtube_url or not isinstance(youtube_url, str):
        print("ERROR: Invalid URL")
        return None, None
    
    # Clean URL
    youtube_url = youtube_url.strip()
    
    try:
        # Try multiple format options
        format_options = [
            'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio/best',
            'worstaudio/worst',
            'best[height<=720]/best'
        ]
        
        for fmt in format_options:
            try:
                ydl_opts = {
                    'format': fmt,
                    'quiet': True,
                    'no_warnings': True,
                    'extract_flat': False,
                    'socket_timeout': 10,
                }
                
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    print(f"Trying format: {fmt}")
                    info = ydl.extract_info(youtube_url, download=False)
                    
                    if not info:
                        continue
                    
                    # Get title
                    title = info.get('title', 'Unknown')
                    
                    # Try direct URL first
                    if 'url' in info and info['url']:
                        print(f"✓ Got direct URL")
                        return info['url'], title
                    
                    # Try formats
                    if 'formats' in info and info['formats']:
                        # Sort by quality (audio bitrate)
                        formats = info['formats']
                        
                        # Prefer audio-only formats
                        audio_formats = [f for f in formats 
                                       if f.get('acodec') != 'none' 
                                       and f.get('vcodec') in [None, 'none']]
                        
                        if audio_formats:
                            # Get best audio by bitrate
                            best = max(audio_formats, 
                                     key=lambda x: x.get('abr', 0) or x.get('tbr', 0) or 0)
                            if best.get('url'):
                                print(f"✓ Got audio format: {best.get('abr', 0)}k")
                                return best['url'], title
                        
                        # Fallback to any format with audio
                        any_audio = [f for f in formats if f.get('acodec') != 'none']
                        if any_audio:
                            best = max(any_audio, 
                                     key=lambda x: x.get('abr', 0) or x.get('tbr', 0) or 0)
                            if best.get('url'):
                                print(f"✓ Got mixed format")
                                return best['url'], title
                        
                        # Last resort - any format
                        if formats and formats[0].get('url'):
                            print(f"✓ Got any format")
                            return formats[0]['url'], title
                            
            except Exception as e:
                print(f"Format {fmt} failed: {e}")
                continue
                
    except Exception as e:
        print(f"ERROR extracting audio: {e}")
        import traceback
        traceback.print_exc()
    
    print("ERROR: All format options failed")
    return None, None

# Cache for search results (prevents repeated slow searches)
_search_cache = {}
_cache_time = {}

def search_youtube_videos(query, max_results=10):
    """
    Search YouTube videos - FIXED with caching
    """
    if not YTDLP_AVAILABLE:
        print("ERROR: yt-dlp not installed")
        return []
    
    if not query or not isinstance(query, str):
        print("ERROR: Invalid query")
        return []
    
    query = query.strip().lower()
    cache_key = f"{query}_{max_results}"
    
    # Check cache (valid for 5 minutes)
    now = time.time()
    if cache_key in _search_cache:
        if now - _cache_time.get(cache_key, 0) < 300:  # 5 min cache
            print(f"✓ Using cached results for: {query}")
            return _search_cache[cache_key]
    
    print(f"Searching YouTube for: {query}")
    
    try:
        search_query = f"ytsearch{max_results}:{query}"
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
            'socket_timeout': 15,
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            results = ydl.extract_info(search_query, download=False)
            
            if not results or 'entries' not in results:
                print("ERROR: No results from yt-dlp")
                return []
            
            videos = []
            for entry in results['entries']:
                if not entry:
                    continue
                
                video_id = entry.get('id', '')
                if not video_id:
                    continue
                
                videos.append({
                    'id': video_id,
                    'title': entry.get('title', 'Unknown')[:100],  # Limit length
                    'channel': entry.get('channel', entry.get('uploader', 'Unknown'))[:50],
                    'duration': entry.get('duration_string', '0:00') or '0:00',
                    'thumbnail': entry.get('thumbnail', f'https://i.ytimg.com/vi/{video_id}/mqdefault.jpg'),
                    'url': f"https://www.youtube.com/watch?v={video_id}"
                })
            
            # Cache results
            _search_cache[cache_key] = videos
            _cache_time[cache_key] = now
            
            print(f"✓ Found {len(videos)} videos")
            return videos
            
    except Exception as e:
        print(f"ERROR searching YouTube: {e}")
        import traceback
        traceback.print_exc()
        return []

# ============================================================================
# NETWORK & UTILS
# ============================================================================

def get_local_ip():
    """Get local IP address"""
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
            with open(ALARM_FILE, 'w') as f:
                json.dump({
                    'enabled': self.alarm_enabled,
                    'time': self.alarm_time,
                    'station_idx': self.alarm_station_idx,
                    'volume_start': self.alarm_volume_start,
                    'volume_end': self.alarm_volume_end,
                    'fade_duration': self.alarm_fade_duration,
                    'days': self.alarm_days
                }, f)
        except Exception as e:
            print(f"Alarm save error: {e}")
    
    def save_sleep_settings(self):
        try:
            with open(SLEEP_FILE, 'w') as f:
                json.dump({
                    'duration': self.sleep_duration,
                    'volume_fade': self.sleep_volume_fade,
                    'stop_method': self.sleep_stop_method
                }, f)
        except Exception as e:
            print(f"Sleep save error: {e}")
    
    def check_alarm(self):
        if not self.alarm_enabled:
            return False
        now = datetime.now()
        current_time = now.strftime("%H:%M")
        current_weekday = now.weekday()
        return (current_time == self.alarm_time and 
                self.alarm_days[current_weekday] and
                not self.sleep_timer_enabled)
    
    def start_sleep_timer(self, duration_minutes=None):
        if duration_minutes:
            self.sleep_duration = duration_minutes * 60
        self.sleep_timer_enabled = True
        self.sleep_start_time = time.time()
        print(f"Sleep timer: {self.sleep_duration//60} min")
    
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
        return int(max(0, self.sleep_duration - elapsed) // 60)

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
        'background': '#000000', 'primary': '#00d2ff', 'secondary': '#9d50bb',
        'accent': '#ffcc00', 'text': '#ffffff', 'card': 'rgba(20,20,20,0.95)',
        'button': 'rgba(30,30,30,0.95)', 'gradient_start': '#000000', 'gradient_end': '#000000'
    }),
    'ocean_blue': Theme('Ocean Blue', {
        'background': '#0f3460', 'primary': '#00d2ff', 'secondary': '#1e90ff',
        'accent': '#ff6b6b', 'text': '#ffffff', 'gradient_start': '#0f3460', 'gradient_end': '#16213e'
    }),
    'cyberpunk': Theme('Cyberpunk', {
        'background': '#0d0221', 'primary': '#ff00ff', 'secondary': '#00ffff',
        'accent': '#ff6b00', 'text': '#ffffff', 'gradient_start': '#0d0221', 'gradient_end': '#2d00aa'
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
        pass

def save_theme(theme_name):
    try:
        with open(THEME_FILE, 'w') as f:
            f.write(theme_name)
    except:
        pass

load_theme()

# ============================================================================
# FLASK APP & HTML TEMPLATE - FIXED
# ============================================================================

app = Flask(__name__)

@app.after_request
def add_cors_headers(response):
    """Add CORS headers for all responses"""
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    return response

# Handle OPTIONS requests for CORS
@app.route('/api/youtube/search', methods=['OPTIONS'])
@app.route('/api/youtube/play', methods=['OPTIONS'])
@app.route('/api/youtube/stop', methods=['OPTIONS'])
@app.route('/api/speak', methods=['OPTIONS'])
def handle_options():
    return jsonify({'success': True})

HTML_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <title>TC Radio v3.1</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <meta name="theme-color" content="{{ theme.primary }}">
    <style>
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; margin: 0; padding: 0; }
        body { background: {{ theme.background }}; color: {{ theme.text }}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; min-height: 100vh; padding-bottom: 20px; }
        .app-header { background: rgba(0,0,0,0.95); padding: 15px; text-align: center; border-bottom: 2px solid {{ theme.primary }}; position: sticky; top: 0; z-index: 100; }
        .header-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 10px; }
        .app-title { color: {{ theme.primary }}; font-size: 22px; font-weight: bold; display: flex; align-items: center; gap: 8px; }
        .connection-status { font-size: 12px; background: rgba(0,255,0,0.2); color: #00ff00; padding: 4px 10px; border-radius: 10px; }
        .disconnect-btn { background: rgba(255,50,50,0.2); border: 1px solid rgba(255,50,50,0.5); color: #ff5050; padding: 6px 12px; border-radius: 10px; font-size: 12px; cursor: pointer; }
        .tabs-container { display: flex; background: rgba(0,0,0,0.95); border-bottom: 1px solid {{ theme.primary }}; overflow-x: auto; scrollbar-width: none; position: sticky; top: 70px; z-index: 99; }
        .tabs-container::-webkit-scrollbar { display: none; }
        .tab-button { flex: 1; padding: 12px 8px; background: transparent; border: none; color: rgba(255,255,255,0.7); font-size: 11px; font-weight: 600; cursor: pointer; white-space: nowrap; min-width: 60px; transition: all 0.3s; }
        .tab-button.active { color: {{ theme.primary }}; border-bottom: 3px solid {{ theme.primary }}; }
        .tab-content { display: none; padding: 15px; background: {{ theme.background }}; min-height: calc(100vh - 140px); }
        .tab-content.active { display: block; animation: fadeIn 0.3s; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .now-playing-card { background: {{ theme.card }}; padding: 20px; border-radius: 16px; margin-bottom: 20px; border-left: 4px solid {{ theme.primary }}; text-align: center; box-shadow: 0 4px 15px rgba(0,0,0,0.3); }
        .now-playing-title { font-size: 12px; color: rgba(255,255,255,0.7); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; }
        .now-playing-text { font-size: 20px; font-weight: bold; color: {{ theme.primary }}; word-break: break-word; }
        .control-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
        .control-btn { background: {{ theme.button }}; border: 2px solid {{ theme.primary }}; color: {{ theme.text }}; padding: 20px 10px; border-radius: 16px; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 8px; transition: all 0.2s; touch-action: manipulation; }
        .control-btn:active { transform: scale(0.95); background: {{ theme.button_hover }}; }
        .control-btn-large { grid-column: span 2; }
        .volume-section { background: {{ theme.card }}; padding: 20px; border-radius: 16px; margin-bottom: 20px; }
        .volume-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
        .volume-label { color: {{ theme.primary }}; font-weight: bold; font-size: 16px; }
        .volume-value { color: {{ theme.primary }}; font-weight: bold; font-size: 18px; }
        .volume-bar-container { background: rgba(0,0,0,0.5); height: 12px; border-radius: 6px; overflow: hidden; margin-bottom: 15px; }
        .volume-bar { height: 100%; background: linear-gradient(90deg, {{ theme.primary }}, {{ theme.secondary }}); border-radius: 6px; transition: width 0.3s ease; }
        .station-list { display: flex; flex-direction: column; gap: 12px; }
        .station-item { background: {{ theme.card }}; border-radius: 16px; padding: 15px; display: flex; align-items: center; cursor: pointer; border: 2px solid transparent; transition: all 0.2s; touch-action: manipulation; }
        .station-item:active { transform: scale(0.98); border-color: {{ theme.primary }}; }
        .station-item.current { border-color: {{ theme.primary }}; background: rgba(0,210,255,0.1); }
        .station-logo { width: 50px; height: 50px; border-radius: 50%; background: {{ theme.primary }}; display: flex; align-items: center; justify-content: center; color: #000; font-weight: bold; font-size: 18px; margin-right: 15px; flex-shrink: 0; }
        .station-info { flex: 1; min-width: 0; }
        .station-name { font-weight: 600; font-size: 16px; color: {{ theme.text }}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .station-item.current .station-name { color: {{ theme.primary }}; }
        .station-genre { font-size: 12px; color: rgba(255,255,255,0.6); margin-top: 4px; }
        .youtube-section { background: {{ theme.card }}; padding: 20px; border-radius: 16px; margin-bottom: 15px; border: 1px solid {{ theme.secondary }}; }
        .youtube-label { font-size: 12px; color: {{ theme.primary }}; font-weight: bold; margin-bottom: 10px; text-transform: uppercase; }
        .youtube-search-box { display: flex; gap: 10px; }
        .youtube-input { flex: 1; padding: 15px; border-radius: 12px; border: 2px solid {{ theme.primary }}; background: rgba(0,0,0,0.7); color: {{ theme.text }}; font-size: 16px; outline: none; }
        .youtube-input:focus { box-shadow: 0 0 10px {{ theme.primary }}40; }
        .youtube-btn { background: {{ theme.button }}; border: 2px solid {{ theme.primary }}; color: {{ theme.text }}; padding: 15px 20px; border-radius: 12px; font-size: 18px; cursor: pointer; min-width: 60px; transition: all 0.2s; }
        .youtube-btn:active { transform: scale(0.95); background: {{ theme.button_hover }}; }
        .youtube-results { margin-top: 15px; }
        .youtube-result { background: rgba(0,0,0,0.5); border-radius: 12px; padding: 12px; display: flex; align-items: center; gap: 12px; margin-bottom: 10px; cursor: pointer; border: 1px solid transparent; transition: all 0.2s; touch-action: manipulation; }
        .youtube-result:active { border-color: {{ theme.primary }}; transform: scale(0.98); }
        .youtube-thumb { width: 80px; height: 60px; border-radius: 8px; object-fit: cover; background: #333; flex-shrink: 0; }
        .youtube-result-info { flex: 1; min-width: 0; }
        .youtube-result-title { font-weight: 600; font-size: 14px; color: {{ theme.text }}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 4px; }
        .youtube-result-channel { font-size: 12px; color: rgba(255,255,255,0.6); }
        .youtube-play-icon { width: 40px; height: 40px; border-radius: 50%; background: {{ theme.primary }}; color: #000; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
        .now-playing-youtube { background: {{ theme.card }}; padding: 20px; border-radius: 16px; border-left: 4px solid {{ theme.accent }}; margin-top: 20px; animation: slideIn 0.3s; }
        @keyframes slideIn { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .now-playing-youtube-label { font-size: 12px; color: rgba(255,255,255,0.7); text-transform: uppercase; margin-bottom: 8px; }
        .now-playing-youtube-title { font-size: 16px; font-weight: bold; color: {{ theme.primary }}; margin-bottom: 15px; word-break: break-word; }
        .stop-btn { width: 100%; background: rgba(255,50,50,0.2); border: 2px solid rgba(255,50,50,0.5); color: #ff5050; padding: 15px; border-radius: 12px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .stop-btn:active { background: rgba(255,50,50,0.4); transform: scale(0.98); }
        .loading { display: none; text-align: center; padding: 20px; color: {{ theme.primary }}; }
        .loading.active { display: block; }
        .error-msg { background: rgba(255,50,50,0.2); border: 1px solid rgba(255,50,50,0.5); color: #ff6b6b; padding: 15px; border-radius: 12px; margin-top: 10px; text-align: center; }
        .info-msg { background: rgba(0,210,255,0.1); border: 1px solid {{ theme.primary }}; color: {{ theme.primary }}; padding: 15px; border-radius: 12px; margin-top: 10px; text-align: center; }
        .theme-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .theme-btn { padding: 20px; border-radius: 16px; border: 2px solid transparent; cursor: pointer; font-weight: bold; color: #fff; text-shadow: 0 2px 4px rgba(0,0,0,0.5); transition: all 0.2s; touch-action: manipulation; }
        .theme-btn:active { transform: scale(0.95); }
        .theme-btn.active { border-color: {{ theme.primary }}; box-shadow: 0 0 20px {{ theme.primary }}; }
        textarea { width: 100%; padding: 15px; border-radius: 12px; border: 2px solid {{ theme.primary }}; background: rgba(0,0,0,0.7); color: {{ theme.text }}; font-size: 16px; min-height: 100px; margin-bottom: 15px; resize: vertical; font-family: inherit; }
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
        <div style="font-size: 12px; color: rgba(255,255,255,0.7);">{{ ip_address }}:8080 | v3.1 | YT:✓</div>
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
            <button class="control-btn" onclick="sendCmd('prev')">⏮️<br>Previous</button>
            <button class="control-btn" onclick="sendCmd('next')">⏭️<br>Next</button>
            <button class="control-btn control-btn-large" onclick="sendCmd('toggle')">⏯️ Play / Pause</button>
            <button class="control-btn control-btn-large" onclick="sendCmd('mute')">🔇 Mute / Unmute</button>
        </div>
        <div class="volume-section">
            <div class="volume-header">
                <span class="volume-label">Volume Control</span>
                <span class="volume-value" id="vol-display">{{ vol_level }}%</span>
            </div>
            <div class="volume-bar-container">
                <div class="volume-bar" id="vol-bar" style="width: {{ vol_level }}%;"></div>
            </div>
            <div class="control-grid">
                <button class="control-btn" onclick="sendCmd('voldown')">🔉<br>-10</button>
                <button class="control-btn" onclick="sendCmd('volup')">🔊<br>+10</button>
            </div>
        </div>
    </div>
    
    <div id="radios-tab" class="tab-content">
        <h3 style="color: {{ theme.primary }}; margin-bottom: 15px;">📻 Available Stations</h3>
        <div class="station-list">
            {% for s in stations %}
            <div class="station-item {% if loop.index0 == current_idx %}current{% endif %}" onclick="playStation({{ loop.index0 }})">
                <div class="station-logo">{{ s.name[:2] }}</div>
                <div class="station-info">
                    <div class="station-name">{{ s.name }}</div>
                    <div class="station-genre">{{ s.genre or 'Internet Radio' }}</div>
                </div>
            </div>
            {% endfor %}
        </div>
    </div>
    
    <div id="speak-tab" class="tab-content">
        <h3 style="color: {{ theme.primary }}; margin-bottom: 15px;">🗣️ Text to Speech</h3>
        <textarea id="speak-text" placeholder="Type something for the radio to speak..."></textarea>
        <button class="control-btn control-btn-large" onclick="speak()">📢 Speak Now</button>
        <div style="margin-top: 15px; font-size: 12px; color: rgba(255,255,255,0.6); text-align: center;">
            Music volume will lower automatically while speaking
        </div>
    </div>
    
    <div id="youtube-tab" class="tab-content">
        <h3 style="color: {{ theme.primary }}; margin-bottom: 15px;">📺 YouTube Audio Player</h3>
        
        <div class="youtube-section">
            <div class="youtube-label">🔍 Search YouTube</div>
            <div class="youtube-search-box">
                <input type="text" id="yt-search" class="youtube-input" placeholder="Search for music, videos..." onkeypress="if(event.key==='Enter')searchYouTube()">
                <button class="youtube-btn" onclick="searchYouTube()">🔍</button>
            </div>
        </div>
        
        <div class="youtube-section">
            <div class="youtube-label">🔗 Or Paste YouTube URL</div>
            <div class="youtube-search-box">
                <input type="text" id="yt-url" class="youtube-input" placeholder="https://www.youtube.com/watch?v=..." onkeypress="if(event.key==='Enter')playYouTubeUrl()">
                <button class="youtube-btn" onclick="playYouTubeUrl()">▶️</button>
            </div>
        </div>
        
        <div class="loading" id="yt-loading">⏳ Searching...</div>
        <div id="yt-error"></div>
        <div class="youtube-results" id="yt-results"></div>
        
        <div id="yt-now-playing" class="now-playing-youtube" style="display: none;">
            <div class="now-playing-youtube-label">Now Playing from YouTube</div>
            <div class="now-playing-youtube-title" id="yt-title"></div>
            <button class="stop-btn" onclick="stopYouTube()">⏹ Stop Playback</button>
        </div>
        
        <div style="margin-top: 20px; font-size: 12px; color: rgba(255,255,255,0.5); text-align: center;">
            💡 Tip: You can minimize the app and audio will continue playing
        </div>
    </div>
    
    <div id="themes-tab" class="tab-content">
        <h3 style="color: {{ theme.primary }}; margin-bottom: 15px;">🎨 Choose Theme</h3>
        <div class="theme-grid">
            {% for key, t in all_themes.items() %}
            <button class="theme-btn {% if key == current_theme_key %}active{% endif %}" 
                    onclick="setTheme('{{ key }}')" 
                    style="background: linear-gradient(135deg, {{ t.gradient_start }}, {{ t.gradient_end }});">
                {{ t.name }}
            </button>
            {% endfor %}
        </div>
    </div>
    
    <script>
        let currentStation = {{ current_idx }};
        let currentVol = {{ vol_level }};
        let isSearching = false;
        
        function switchTab(tab, btn) {
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            document.getElementById(tab + '-tab').classList.add('active');
            btn.classList.add('active');
        }
        
        function sendCmd(cmd) {
            fetch('/api/' + cmd)
                .then(() => {
                    if (cmd.includes('vol')) updateVolume();
                    if (['prev','next','toggle'].includes(cmd)) setTimeout(updateNowPlaying, 200);
                })
                .catch(err => console.error('Command failed:', err));
        }
        
        function playStation(idx) {
            fetch('/api/play/' + idx)
                .then(() => {
                    currentStation = idx;
                    updateNowPlaying();
                    document.querySelectorAll('.station-item').forEach((el, i) => {
                        el.classList.toggle('current', i === idx);
                    });
                    switchTab('controller', document.querySelector('.tab-button'));
                })
                .catch(err => console.error('Play station failed:', err));
        }
        
        function updateVolume() {
            fetch('/api/volume')
                .then(r => r.json())
                .then(data => {
                    currentVol = data.volume;
                    document.getElementById('vol-bar').style.width = data.volume + '%';
                    document.getElementById('vol-display').textContent = data.volume + '%';
                })
                .catch(err => console.error('Volume update failed:', err));
        }
        
        function updateNowPlaying() {
            fetch('/api/nowplaying')
                .then(r => r.json())
                .then(data => {
                    document.getElementById('now-playing').textContent = data.text;
                })
                .catch(err => console.error('Now playing update failed:', err));
        }
        
        function speak() {
            const text = document.getElementById('speak-text').value.trim();
            if (!text) return alert('Please enter text to speak');
            
            fetch('/api/speak', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({text: text})
            })
            .then(() => {
                document.getElementById('speak-text').value = '';
            })
            .catch(err => alert('Speak failed: ' + err));
        }
        
        function searchYouTube() {
            if (isSearching) return;
            
            const query = document.getElementById('yt-search').value.trim();
            if (!query) return alert('Please enter a search term');
            
            isSearching = true;
            document.getElementById('yt-loading').classList.add('active');
            document.getElementById('yt-error').innerHTML = '';
            document.getElementById('yt-results').innerHTML = '';
            
            console.log('Searching for:', query);
            
            fetch('/api/youtube/search', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({query: query})
            })
            .then(async r => {
                const text = await r.text();
                try {
                    return JSON.parse(text);
                } catch (e) {
                    throw new Error('Invalid JSON: ' + text.substring(0, 100));
                }
            })
            .then(data => {
                isSearching = false;
                document.getElementById('yt-loading').classList.remove('active');
                
                if (data.success) {
                    showYouTubeResults(data.results);
                } else {
                    showError(data.error || 'Search failed');
                }
            })
            .catch(err => {
                isSearching = false;
                document.getElementById('yt-loading').classList.remove('active');
                showError('Network error: ' + err.message);
                console.error('Search error:', err);
            });
        }
        
        function showYouTubeResults(results) {
            const container = document.getElementById('yt-results');
            
            if (!results || results.length === 0) {
                container.innerHTML = '<div class="error-msg">No results found. Try different keywords.</div>';
                return;
            }
            
            container.innerHTML = results.map(v => `
                <div class="youtube-result" onclick="playYouTube('${escapeHtml(v.url)}', '${escapeHtml(v.title)}')">
                    <img src="${v.thumbnail}" class="youtube-thumb" onerror="this.style.display='none'" loading="lazy">
                    <div class="youtube-result-info">
                        <div class="youtube-result-title">${escapeHtml(v.title)}</div>
                        <div class="youtube-result-channel">${escapeHtml(v.channel)} • ${v.duration}</div>
                    </div>
                    <div class="youtube-play-icon">▶</div>
                </div>
            `).join('');
        }
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML.replace(/'/g, "&apos;").replace(/"/g, "&quot;");
        }
        
        function playYouTubeUrl() {
            const url = document.getElementById('yt-url').value.trim();
            if (!url) return alert('Please enter a YouTube URL');
            playYouTube(url, 'YouTube Video');
        }
        
        function playYouTube(url, title) {
            document.getElementById('yt-loading').classList.add('active');
            document.getElementById('yt-error').innerHTML = '';
            
            fetch('/api/youtube/play', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({url: url, title: title})
            })
            .then(r => r.json())
            .then(data => {
                document.getElementById('yt-loading').classList.remove('active');
                
                if (data.success) {
                    document.getElementById('yt-now-playing').style.display = 'block';
                    document.getElementById('yt-title').textContent = data.title;
                    updateNowPlaying();
                } else {
                    showError(data.error || 'Failed to play video. Try another one.');
                }
            })
            .catch(err => {
                document.getElementById('yt-loading').classList.remove('active');
                showError('Error: ' + err.message);
            });
        }
        
        function stopYouTube() {
            fetch('/api/youtube/stop', {method: 'POST'})
                .then(() => {
                    document.getElementById('yt-now-playing').style.display = 'none';
                    updateNowPlaying();
                })
                .catch(err => console.error('Stop failed:', err));
        }
        
        function showError(msg) {
            document.getElementById('yt-error').innerHTML = `<div class="error-msg">${escapeHtml(msg)}</div>`;
        }
        
        function setTheme(themeName) {
            fetch('/api/theme/' + themeName)
                .then(() => location.reload())
                .catch(err => alert('Theme change failed: ' + err));
        }
        
        // Auto-update
        setInterval(() => {
            updateNowPlaying();
            updateVolume();
        }, 3000);
        
        // Initial update
        updateNowPlaying();
        updateVolume();
    </script>
</body>
</html>
"""

# ============================================================================
# FLASK ROUTES - FIXED
# ============================================================================

stations = []
current_idx = 0
vol_level = 80
meta_text = ""

@app.route('/')
def home():
    global meta_text, stations, current_idx, vol_level, current_theme
    try:
        current_theme_key = [k for k, t in THEMES.items() if t.name == current_theme.name][0]
    except:
        current_theme_key = 'true_black'
    
    return render_template_string(
        HTML_TEMPLATE,
        stations=stations,
        ip_address=current_ip,
        vol_level=vol_level,
        current_idx=current_idx,
        now_playing=meta_text if meta_text else (stations[current_idx]['name'] if stations and current_idx < len(stations) else "No Station"),
        theme=current_theme,
        current_theme_key=current_theme_key,
        all_themes=THEMES
    )

@app.route('/api/<action>')
def api_action(action):
    global current_idx, vol_level, player, stations, meta_text
    try:
        if action == 'next':
            current_idx = (current_idx + 1) % len(stations) if stations else 0
            play_station()
        elif action == 'prev':
            current_idx = (current_idx - 1) % len(stations) if stations else 0
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
        print(f"API error ({action}): {e}")
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/play/<int:idx>')
def play_index(idx):
    global current_idx
    try:
        if stations:
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
    text = meta_text if meta_text else (stations[current_idx]['name'] if stations and current_idx < len(stations) else "No Station")
    return jsonify({'text': text})

@app.route('/api/speak', methods=['POST'])
def api_speak():
    global player, vol_level
    try:
        data = request.get_json()
        text = data.get('text', '') if data else ''
        if text and player:
            orig_vol = vol_level
            player.audio_set_volume(int(orig_vol * 0.3))
            subprocess.Popen(['espeak', '-v', 'en', text], 
                           stdout=subprocess.DEVNULL, 
                           stderr=subprocess.DEVNULL)
            def restore_vol():
                time.sleep(2)
                if player:
                    player.audio_set_volume(orig_vol)
            threading.Thread(target=restore_vol, daemon=True).start()
        return jsonify({'success': True})
    except Exception as e:
        print(f"Speak error: {e}")
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/theme/<theme_name>')
def set_theme_route(theme_name):
    global current_theme
    if theme_name in THEMES:
        current_theme = THEMES[theme_name]
        save_theme(theme_name)
    return jsonify({'success': True})

# FIXED: YouTube routes with better error handling
@app.route('/api/youtube/search', methods=['POST'])
def youtube_search_route():
    """Search YouTube - FIXED with better error handling"""
    try:
        # Get JSON data safely
        data = request.get_json(silent=True) or {}
        query = data.get('query', '').strip() if isinstance(data, dict) else ''
        
        if not query:
            return jsonify({'success': False, 'error': 'Please enter a search term'})
        
        print(f"YouTube search: {query}")
        results = search_youtube_videos(query, max_results=10)
        
        return jsonify({
            'success': True, 
            'results': results,
            'count': len(results)
        })
        
    except Exception as e:
        print(f"YouTube search route error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Search failed: ' + str(e)})

@app.route('/api/youtube/play', methods=['POST'])
def youtube_play_route():
    """Play YouTube video - FIXED with better error handling"""
    global player, instance, youtube_playing, youtube_current_title, youtube_current_url, meta_text, vol_level
    
    try:
        data = request.get_json(silent=True) or {}
        url = data.get('url', '').strip() if isinstance(data, dict) else ''
        title = data.get('title', 'YouTube Video') if isinstance(data, dict) else 'YouTube Video'
        
        if not url:
            return jsonify({'success': False, 'error': 'No URL provided'})
        
        print(f"YouTube play: {url[:60]}...")
        
        # Extract audio
        audio_url, video_title = get_youtube_audio_url(url)
        
        if not audio_url:
            return jsonify({
                'success': False, 
                'error': 'Could not extract audio. The video may be age-restricted, private, or unavailable. Try a different video.'
            })
        
        # Play it
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
        
        print(f"Playing: {youtube_current_title}")
        
        return jsonify({
            'success': True, 
            'title': youtube_current_title
        })
        
    except Exception as e:
        print(f"YouTube play route error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Playback failed: ' + str(e)})

@app.route('/api/youtube/stop', methods=['POST'])
def youtube_stop_route():
    """Stop YouTube playback"""
    global youtube_playing, youtube_current_title, youtube_current_url, meta_text
    
    try:
        if player:
            player.stop()
        
        youtube_playing = False
        youtube_current_title = ""
        youtube_current_url = ""
        meta_text = ""
        
        # Return to radio
        if stations:
            play_station()
        
        return jsonify({'success': True})
        
    except Exception as e:
        print(f"YouTube stop error: {e}")
        return jsonify({'success': False, 'error': str(e)})

# ============================================================================
# RADIO PLAYER
# ============================================================================

def load_stations():
    """Load radio stations from URL"""
    global stations
    try:
        response = requests.get(STATIONS_URL, timeout=15)
        stations = response.json()
        print(f"✓ Loaded {len(stations)} stations")
    except Exception as e:
        print(f"✗ Error loading stations: {e}")
        stations = [
            {"name": "BBC Radio 1", "url": "http://stream.live.vc.bbcmedia.co.uk/bbc_radio_one", "genre": "Pop"},
            {"name": "BBC Radio 2", "url": "http://stream.live.vc.bbcmedia.co.uk/bbc_radio_two", "genre": "Adult Contemporary"},
            {"name": "NPR", "url": "https://npr-ice.streamguys1.com/live.mp3", "genre": "News"},
        ]

def play_station():
    """Play current radio station"""
    global meta_text, current_idx, vol_level, player, instance
    
    if not stations or current_idx >= len(stations):
        print("No stations available")
        return
    
    station = stations[current_idx]
    try:
        print(f"Playing station: {station['name']}")
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
    """Run Flask server"""
    print(f"Starting web server on port {DEFAULT_PORT}")
    app.run(host='0.0.0.0', port=DEFAULT_PORT, debug=False, use_reloader=False, threaded=True)

# ============================================================================
# PYGAME DISPLAY (Optional - runs if display available)
# ============================================================================

def init_display():
    """Initialize Pygame display"""
    global screen, f_lg, f_sm, f_xl, f_med, f_tiny, player, instance
    
    os.environ['SDL_VIDEODRIVER'] = 'x11'
    os.environ['DISPLAY'] = ':0'
    
    try:
        pygame.init()
        screen = pygame.display.set_mode((320, 480), pygame.FULLSCREEN | pygame.NOFRAME)
        print("✓ Fullscreen display initialized")
    except:
        try:
            screen = pygame.display.set_mode((320, 480))
            print("✓ Windowed display initialized")
        except Exception as e:
            screen = None
            print(f"✗ No display available: {e}")
    
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
    
    instance = vlc.Instance('--no-video --network-caching=1000')
    player = instance.media_player_new()

def draw_interface():
    """Draw Pygame interface"""
    screen.fill(current_theme.pygame_background)
    
    # Header
    pygame.draw.rect(screen, current_theme.pygame_primary, (0, 0, 320, 60))
    title = f_lg.render("TC RADIO", True, (0, 0, 0))
    screen.blit(title, (100, 15))
    
    # IP
    ip_text = f_sm.render(f"{current_ip}:8080", True, current_theme.pygame_accent)
    screen.blit(ip_text, (10, 70))
    
    # Now playing
    now_text = f_med.render("NOW PLAYING:", True, current_theme.pygame_primary)
    screen.blit(now_text, (10, 120))
    
    station_name = meta_text if meta_text else (stations[current_idx]['name'] if stations else "No Station")
    # Truncate if too long
    if len(station_name) > 20:
        station_name = station_name[:18] + ".."
    name_surf = f_lg.render(station_name, True, current_theme.pygame_text)
    screen.blit(name_surf, (10, 150))
    
    # Volume bar
    vol_text = f_med.render(f"Volume: {vol_level}%", True, current_theme.pygame_text)
    screen.blit(vol_text, (10, 220))
    pygame.draw.rect(screen, (40, 40, 40), (10, 250, 300, 20))
    vol_width = int(300 * vol_level / 100)
    pygame.draw.rect(screen, current_theme.pygame_primary, (10, 250, vol_width, 20))
    
    # Status
    status = "Playing" if player and player.is_playing() else "Paused"
    status_color = (0, 255, 0) if status == "Playing" else (255, 165, 0)
    status_surf = f_med.render(status, True, status_color)
    screen.blit(status_surf, (10, 300))
    
    # Controls hint
    hint = f_tiny.render("Touch: Play/Pause | Left/Right: Change", True, (100, 100, 100))
    screen.blit(hint, (10, 450))
    
    pygame.display.flip()

def handle_events():
    """Handle Pygame events"""
    global running, current_idx, vol_level
    
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        elif event.type == pygame.MOUSEBUTTONDOWN:
            x, y = event.pos
            if y > 350:  # Bottom area = play/pause
                if player:
                    player.pause()
            elif x < 160:  # Left = prev
                if stations:
                    current_idx = (current_idx - 1) % len(stations)
                    play_station()
            else:  # Right = next
                if stations:
                    current_idx = (current_idx + 1) % len(stations)
                    play_station()

# ============================================================================
# MAIN
# ============================================================================

def main():
    global running, current_idx
    
    print(f"\n{'='*60}")
    print(f"  🚀 TC RADIO v{APP_VERSION} - FIXED VERSION")
    print(f"{'='*60}")
    print(f"  📱 Web Interface: http://{current_ip}:{DEFAULT_PORT}")
    print(f"  🎵 YouTube Audio: ENABLED")
    print(f"{'='*60}\n")
    
    # Check dependencies
    if not YTDLP_AVAILABLE:
        print("⚠️  WARNING: yt-dlp not installed. YouTube will not work.")
        print("    Install with: pip3 install yt-dlp")
    else:
        print("✓ YouTube support enabled")
    
    # Load stations
    load_stations()
    
    # Load last station
    if os.path.exists(LAST_STATION_FILE):
        try:
            with open(LAST_STATION_FILE, 'r') as f:
                saved = int(f.read())
                if stations and 0 <= saved < len(stations):
                    current_idx = saved
        except:
            pass
    
    # Init display and player
    init_display()
    
    # Start Flask in background
    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()
    
    # Play first station
    if stations:
        play_station()
    
    # Main loop
    running = True
    clock = pygame.time.Clock()
    
    while running:
        try:
            handle_events()
            draw_interface()
            
            # Check alarm
            if alarm_system.check_alarm():
                print("ALARM TRIGGERED!")
                # TODO: Implement alarm playback
            
            # Check sleep timer
            if alarm_system.check_sleep_timer():
                print("Sleep timer ended")
                if player:
                    player.pause()
            
            clock.tick(30)
        except KeyboardInterrupt:
            running = False
        except Exception as e:
            print(f"Main loop error: {e}")
            time.sleep(1)
    
    # Cleanup
    try:
        pygame.quit()
        if player:
            player.stop()
    except:
        pass
    print("\nRadio stopped")

if __name__ == '__main__':
    main()
