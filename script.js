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
    const stationList = document.getElementById('stationList');
    stationList.innerHTML = '';
    customStations.forEach(station => stationList.appendChild(createStationItem(station)));
    updateFavoriteButtons();
}

// Create station element
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
                <!-- Favorite SVG -->
            </button>
            <button class="action-btn share-btn">
                <!-- Share SVG -->
            </button>
        </div>
    `;
    return div;
}

// Event delegation for stations
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
            updatePlayerArtwork(station.logo);
            updatePlayerInfo(station.name);
            updatePlayButton(true);
            startMetadataFetch();
        })
        .catch(error => showError('Error playing station. Try another one.'));
}

function togglePlayback() {
    if (audio.paused) {
        audio.play()
            .then(() => updatePlayButton(true))
            .catch(error => showError('Resume failed'));
    } else {
        audio.pause();
        updatePlayButton(false);
    }
}

function updatePlayButton(playing) {
    const playIcon = document.getElementById('playIcon');
    const pauseIcon = document.getElementById('pauseIcon');
    playIcon.style.display = playing ? 'none' : 'block';
    pauseIcon.style.display = playing ? 'block' : 'none';
    
    const playerArtwork = document.getElementById('playerArtwork');
    playing ? playerArtwork.classList.add('playing') : playerArtwork.classList.remove('playing');
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

// Metadata handling
function startMetadataFetch() {
    if (metadataInterval) clearInterval(metadataInterval);
    metadataInterval = setInterval(fetchMetadata, 5000);
}

async function fetchMetadata() {
    try {
        const response = await fetch(audio.src, { headers: { 'Icy-MetaData': '1' } });
        const icyMetaInt = response.headers.get('icy-metaint');
        if (!icyMetaInt) return;

        const reader = response.body.getReader();
        // ... (metadata parsing logic from previous versions) ...
    } catch (error) {
        console.error('Metadata error:', error);
    }
}

// Favorites system
function toggleFavorite(station) {
    const index = favorites.findIndex(fav => fav.url === station.url);
    index === -1 ? favorites.push(station) : favorites.splice(index, 1);
    localStorage.setItem('radioFavorites', JSON.stringify(favorites));
    updateFavoriteButtons();
    if (currentView === 'favorites') showFavorites();
}

function updateFavoriteButtons() {
    document.querySelectorAll('.favorite-btn').forEach(btn => {
        const stationUrl = btn.closest('.station-item').dataset.stationUrl;
        btn.classList.toggle('active', favorites.some(fav => fav.url === stationUrl));
    });
}

// Sleep timer
document.getElementById('setTimerBtn').addEventListener('click', () => {
    const minutes = parseInt(document.getElementById('timerSelect').value);
    minutes > 0 ? setTimer(minutes) : clearTimer();
    document.getElementById('timerMenu').style.display = 'none';
});

function setTimer(minutes) {
    clearTimer();
    timer = setTimeout(() => {
        audio.pause();
        updatePlayButton(false);
        showError('Sleep timer: Playback stopped');
    }, minutes * 60 * 1000);
}

// Initialization
document.getElementById('playPauseBtn').addEventListener('click', togglePlayback);
loadStations();

// Helper functions
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    document.body.prepend(errorDiv);
    setTimeout(() => errorDiv.remove(), 5000);
}
