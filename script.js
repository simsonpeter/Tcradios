// script.js
let customStations = [];
const audio = new Audio();
let currentStation = null;
let favorites = JSON.parse(localStorage.getItem('radioFavorites')) || [];
let currentView = 'all';
let metadataInterval = null;
let timer = null;

// Load stations from JSON
async function loadStations() {
    try {
        const response = await fetch('stations.json');
        if (!response.ok) throw new Error('Failed to load stations');
        customStations = await response.json();
        initStations();
    } catch (error) {
        showError('Failed to load stations. Please refresh the page.');
    }
}

// Initialize stations
function initStations() {
    renderStations(customStations);
}

// Tab handling
document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', (e) => {
        const tab = e.target.id.replace('Tab', '').toLowerCase();
        showTab(tab);
    });
});

function showTab(tab) {
    currentView = tab;
    
    // Update active tab
    document.querySelectorAll('.tab-button').forEach(btn => 
        btn.classList.toggle('active', btn.id === `${tab}Tab`)
    );

    // Update content visibility
    document.getElementById('stationList').style.display = 
        tab === 'about' ? 'none' : 'block';
    document.getElementById('aboutContent').style.display = 
        tab === 'about' ? 'block' : 'none';
    document.getElementById('searchInput').style.display = 
        tab === 'about' ? 'none' : 'block';

    // Load appropriate content
    if (tab === 'favorites') showFavorites();
    if (tab === 'all') initStations();
}

// Timer functionality
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
    if (minutes > 0) {
        setTimer(minutes);
    } else {
        clearTimer();
    }
    timerMenu.style.display = 'none';
});

function setTimer(minutes) {
    clearTimer();
    timer = setTimeout(() => {
        audio.pause();
        updatePlayButton(false);
        showNotification(`Sleep timer: Stopped after ${minutes} minutes`);
    }, minutes * 60 * 1000);
    showNotification(`Sleep timer set for ${minutes} minutes`);
}

function clearTimer() {
    if (timer) {
        clearTimeout(timer);
        timer = null;
    }
}

// Station list rendering
function renderStations(stations) {
    const stationList = document.getElementById('stationList');
    stationList.innerHTML = '';
    
    if (stations.length === 0) {
        stationList.innerHTML = '<div class="no-stations">No stations found</div>';
        return;
    }

    stations.forEach(station => {
        stationList.appendChild(createStationItem(station));
    });

    updateFavoriteButtons();
}

function createStationItem(station) {
    const div = document.createElement('div');
    div.className = 'station-item';
    div.dataset.stationUrl = station.url;
    div.innerHTML = `
        <img src="${station.logo}" class="station-artwork" alt="${station.name}">
        <div class="station-info">
            <div class="station-name">${station.name}</div>
            <div class="station-genre">${station.genre}</div>
        </div>
        <div class="station-actions">
            <button class="action-btn favorite-btn">
                <!-- SVG code -->
            </button>
            <button class="action-btn share-btn">
                <!-- SVG code -->
            </button>
        </div>
    `;
    return div;
}

// Event delegation for station actions
document.getElementById('stationList').addEventListener('click', (e) => {
    const stationItem = e.target.closest('.station-item');
    if (!stationItem) return;

    const station = customStations.find(s => s.url === stationItem.dataset.stationUrl);
    
    if (e.target.closest('.favorite-btn')) {
        toggleFavorite(station);
    } else if (e.target.closest('.share-btn')) {
        shareStation(station);
    } else {
        playStation(station);
    }
});

// Player controls
function playStation(station) {
    if (currentStation?.url === station.url) {
        togglePlayback();
        return;
    }

    currentStation = station;
    audio.src = station.url;
    
    audio.play()
        .then(() => {
            updatePlayerDisplay(station);
            startMetadataFetch();
        })
        .catch(error => showError('Error playing station'));
}

function togglePlayback() {
    if (audio.paused) {
        audio.play().catch(error => showError('Playback failed'));
        updatePlayButton(true);
    } else {
        audio.pause();
        updatePlayButton(false);
    }
}

function updatePlayerDisplay(station) {
    document.getElementById('playerArtwork').src = station.logo || 'default-artwork.jpg';
    document.getElementById('playerTitle').textContent = station.name;
    document.getElementById('playerArtwork').classList.add('playing');
    updatePlayButton(true);
}

function updatePlayButton(playing) {
    document.getElementById('playIcon').style.display = playing ? 'none' : 'block';
    document.getElementById('pauseIcon').style.display = playing ? 'block' : 'none';
    const playerArtwork = document.getElementById('playerArtwork');
    playerArtwork.style.animationPlayState = playing ? 'running' : 'paused';
}

// Favorites system
function toggleFavorite(station) {
    const index = favorites.findIndex(fav => fav.url === station.url);
    if (index === -1) {
        favorites.push(station);
    } else {
        favorites.splice(index, 1);
    }
    localStorage.setItem('radioFavorites', JSON.stringify(favorites));
    updateFavoriteButtons();
    
    if (currentView === 'favorites') showFavorites();
}

function showFavorites() {
    renderStations(favorites);
}

function updateFavoriteButtons() {
    document.querySelectorAll('.favorite-btn').forEach(btn => {
        const stationUrl = btn.closest('.station-item').dataset.stationUrl;
        btn.classList.toggle('active', favorites.some(fav => fav.url === stationUrl));
    });
}

// Initialization
document.getElementById('playPauseBtn').addEventListener('click', togglePlayback);
loadStations();

// Helper functions
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'notification error';
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 5000);
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}
