// Initialize global variables
let customStations = []; // Will be populated from stations.json
const audio = new Audio();
let currentStation = null;
let favorites = JSON.parse(localStorage.getItem('radioFavorites')) || [];
let currentView = 'all';
let metadataInterval = null;
let timer = null;

// Load stations from JSON file
async function loadStations() {
    try {
        const response = await fetch('stations.json');
        if (!response.ok) throw new Error('Failed to load stations');
        customStations = await response.json();
        initStations();
    } catch (error) {
        console.error('Error loading stations:', error);
        // Display error to user
        document.getElementById('stationList').innerHTML = 
            '<div class="error">Failed to load radio stations. Please try again later.</div>';
    }
}

// Theme Toggle
const themeToggle = document.getElementById('themeToggle');
themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    themeToggle.textContent = isLight ? '🌓' : '🌓';
});

// Initialize theme from localStorage
if(localStorage.getItem('theme') === 'light') {
    document.body.classList.add('light-theme');
    themeToggle.textContent = '🌓';
}

// Tab Handling
document.getElementById('allTab').addEventListener('click', () => {
    showTab('all');
    initStations();
});

document.getElementById('favoritesTab').addEventListener('click', () => {
    showTab('favorites');
    showFavorites();
});

document.getElementById('aboutTab').addEventListener('click', () => {
    showTab('about');
});

function showTab(tab) {
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`${tab}Tab`).classList.add('active');
    
    const stationList = document.getElementById('stationList');
    const aboutContent = document.getElementById('aboutContent');
    const searchInput = document.getElementById('searchInput');
    
    stationList.style.display = tab === 'about' ? 'none' : 'block';
    aboutContent.style.display = tab === 'about' ? 'block' : 'none';
    searchInput.style.display = tab === 'about' ? 'none' : 'block';
}

// Search Functionality
document.getElementById('searchInput').addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const filteredStations = customStations.filter(station => 
        station.name.toLowerCase().includes(query) || 
        station.genre.toLowerCase().includes(query)
    );
    renderStations(filteredStations);
});

// Station Management
function createStationItem(station) {
    const stationItem = document.createElement('div');
    stationItem.className = 'station-item';
    stationItem.innerHTML = `
        <img src="${station.logo}" class="station-artwork" alt="${station.name}">
        <div class="station-info">
            <div class="station-name">${station.name}</div>
            <div class="station-genre">${station.genre}</div>
        </div>
        <div class="station-actions">
            <button class="action-btn favorite-btn" data-station="${station.url}">
                <svg width="24" height="24" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
            </button>
            <button class="action-btn share-btn">
                <svg width="24" height="24" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92c0-1.61-1.31-2.92-2.92-2.92z"/>
                </svg>
            </button>
        </div>
    `;

    const favoriteBtn = stationItem.querySelector('.favorite-btn');
    favoriteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(station);
    });
    
    stationItem.querySelector('.share-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        shareStation(station);
    });
    
    stationItem.addEventListener('click', () => playStation(station));
    
    return stationItem;
}

function renderStations(stations) {
    const stationList = document.getElementById('stationList');
    stationList.innerHTML = stations.length > 0 
        ? stations.map(station => createStationItem(station).outerHTML).join('')
        : '<div class="no-results">No stations found</div>';
    
    updateFavoriteButtons();
}

function initStations() {
    renderStations(customStations);
}

function showFavorites() {
    renderStations(favorites);
}

// Favorites System
function toggleFavorite(station) {
    const index = favorites.findIndex(fav => fav.url === station.url);
    if(index === -1) {
        favorites.push(station);
    } else {
        favorites.splice(index, 1);
    }
    localStorage.setItem('radioFavorites', JSON.stringify(favorites));
    updateFavoriteButtons();
    
    if(currentView === 'favorites') showFavorites();
}

function updateFavoriteButtons() {
    document.querySelectorAll('.favorite-btn').forEach(btn => {
        const stationUrl = btn.dataset.station;
        btn.classList.toggle('active', favorites.some(fav => fav.url === stationUrl));
    });
}

// Player Controls
function playStation(station) {
    if(currentStation?.url === station.url) {
        togglePlayback();
        return;
    }
    
    currentStation = station;
    audio.src = station.url;
    audio.play().catch(error => {
        console.error('Error playing station:', error);
        alert('Error playing station. Please try another one.');
    });
    
    updatePlayButton(true);
    updatePlayerArtwork(station.logo);
    updatePlayerInfo(station.name);
    startMetadataFetch();
}

function togglePlayback() {
    if(audio.paused) {
        audio.play().catch(error => console.error('Playback error:', error));
        updatePlayButton(true);
        document.getElementById('playerArtwork').classList.add('playing');
    } else {
        audio.pause();
        updatePlayButton(false);
        document.getElementById('playerArtwork').classList.remove('playing');
    }
}

function updatePlayButton(playing) {
    document.getElementById('playIcon').style.display = playing ? 'none' : 'block';
    document.getElementById('pauseIcon').style.display = playing ? 'block' : 'none';
}

function updatePlayerArtwork(logoUrl) {
    const playerArtwork = document.getElementById('playerArtwork');
    playerArtwork.src = logoUrl || '/icons/default-artwork.jpg';
    playerArtwork.classList.add('playing');
}

function updatePlayerInfo(stationName) {
    document.getElementById('playerTitle').textContent = stationName;
    document.getElementById('playerMetadata').textContent = 'Loading metadata...';
}

// Metadata Handling
function startMetadataFetch() {
    if (metadataInterval) clearInterval(metadataInterval);
    metadataInterval = setInterval(extractMetadata, 5000);
}

async function extractMetadata() {
    if (!audio.src || audio.readyState === 0) return;

    try {
        const response = await fetch(audio.src, {
            headers: { 'Icy-MetaData': '1' }
        });
        
        const icyMetaInt = response.headers.get('icy-metaint');
        if (!icyMetaInt) return;

        const reader = response.body.getReader();
        let buffer = new Uint8Array();
        let metadataLength = 0;

        const processData = ({ done, value }) => {
            if (done) return;
            buffer = new Uint8Array([...buffer, ...value]);

            if (metadataLength === 0 && buffer.length >= icyMetaInt) {
                metadataLength = buffer[icyMetaInt] * 16;
                buffer = buffer.slice(icyMetaInt + 1);
            }

            if (metadataLength > 0 && buffer.length >= metadataLength) {
                const metadataBytes = buffer.slice(0, metadataLength);
                const metadataText = new TextDecoder().decode(metadataBytes);
                updateMetadataDisplay(parseMetadata(metadataText));
                buffer = buffer.slice(metadataLength);
                metadataLength = 0;
            }

            reader.read().then(processData);
        };

        reader.read().then(processData);
    } catch (error) {
        console.error('Metadata fetch error:', error);
    }
}

function parseMetadata(metadataText) {
    return metadataText.split(';').reduce((acc, part) => {
        const [key, value] = part.split('=');
        if (key && value) acc[key.trim()] = value.trim().replace(/'/g, '');
        return acc;
    }, {});
}

function updateMetadataDisplay(metadata) {
    const metadataElement = document.getElementById('playerMetadata');
    metadataElement.textContent = metadata.StreamTitle || 'No metadata available';
}

// Sleep Timer
const timerIcon = document.getElementById('timerIcon');
const timerMenu = document.getElementById('timerMenu');
const timerSelect = document.getElementById('timerSelect');
const setTimerBtn = document.getElementById('setTimerBtn');

timerIcon.addEventListener('click', (e) => {
    e.stopPropagation();
    timerMenu.style.display = timerMenu.style.display === 'flex' ? 'none' : 'flex';
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.floating-timer')) {
        timerMenu.style.display = 'none';
    }
});

setTimerBtn.addEventListener('click', () => {
    const minutes = parseInt(timerSelect.value);
    minutes > 0 ? setTimer(minutes) : clearTimer();
    timerMenu.style.display = 'none';
});

function setTimer(minutes) {
    clearTimer();
    timer = setTimeout(() => {
        audio.pause();
        updatePlayButton(false);
        alert("Sleep timer: Playback stopped.");
    }, minutes * 60 * 1000);
}

function clearTimer() {
    if (timer) {
        clearTimeout(timer);
        timer = null;
    }
}

// Sharing
function shareStation(station) {
    if (navigator.share) {
        navigator.share({
            title: `Listen to ${station.name}`,
            text: "Check out this radio station on TC Radios",
            url: window.location.href
        });
    } else {
        const shareUrl = window.location.href;
        navigator.clipboard.writeText(shareUrl).then(() => {
            alert('Link copied to clipboard!');
        });
    }
}

// Draggable Timer
let isDragging = false;
let offsetX, offsetY;
const floatingTimer = document.getElementById('floatingTimer');

floatingTimer.addEventListener('mousedown', startDrag);
floatingTimer.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startDrag(e.touches[0]);
});

document.addEventListener('mousemove', drag);
document.addEventListener('touchmove', (e) => drag(e.touches[0]));

document.addEventListener('mouseup', endDrag);
document.addEventListener('touchend', endDrag);

function startDrag(e) {
    isDragging = true;
    offsetX = e.clientX - floatingTimer.offsetLeft;
    offsetY = e.clientY - floatingTimer.offsetTop;
    floatingTimer.style.cursor = 'grabbing';
}

function drag(e) {
    if (!isDragging) return;
    const x = e.clientX - offsetX;
    const y = e.clientY - offsetY;
    
    const maxX = window.innerWidth - floatingTimer.offsetWidth;
    const maxY = window.innerHeight - floatingTimer.offsetHeight;
    
    floatingTimer.style.left = `${Math.min(Math.max(x, 0), maxX)}px`;
    floatingTimer.style.top = `${Math.min(Math.max(y, 0), maxY)}px`;
}

function endDrag() {
    isDragging = false;
    floatingTimer.style.cursor = 'grab';
}

// Initialize
document.getElementById('playPauseBtn').addEventListener('click', togglePlayback);
loadStations();

// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('ServiceWorker registered:', registration);
            })
            .catch(error => {
                console.log('ServiceWorker registration failed:', error);
            });
    });
}

// OneSignal Initialization
window.OneSignal = window.OneSignal || [];
OneSignal.push(function() {
    OneSignal.init({
        appId: "a71d9878-20e6-4edb-9da7-5e41e2648c8c",
        safari_web_id: "web.onesignal.auto.5c6acdd7-2576-4d7e-9cb0-efba7bf8602e",
        notifyButton: { enable: true },
        allowLocalhostAsSecureOrigin: true,
    });
});
