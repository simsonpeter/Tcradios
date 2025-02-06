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
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        customStations = await response.json();
        initStations();
    } catch (error) {
        showError(`Failed to load stations: ${error.message}`);
    }
}

// Initialize stations
function initStations() {
    renderStations(currentView === 'favorites' ? favorites : customStations);
}

// Create station element
function createStationItem(station) {
    const div = document.createElement('div');
    div.className = 'station-item';
    div.dataset.stationId = station.url;
    div.innerHTML = `
        <img src="${station.logo}" class="station-artwork" alt="${station.name}">
        <div class="station-info">
            <div class="station-name">${station.name}</div>
            <div class="station-genre">${station.genre}</div>
        </div>
        <div class="station-actions">
            <button class="action-btn favorite-btn">
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
    return div;
}

// Event delegation for station actions
document.getElementById('stationList').addEventListener('click', (e) => {
    const stationItem = e.target.closest('.station-item');
    if (!stationItem) return;

    const station = customStations.find(s => s.url === stationItem.dataset.stationId);
    
    if (e.target.closest('.favorite-btn')) {
        e.preventDefault();
        toggleFavorite(station);
    } else if (e.target.closest('.share-btn')) {
        e.preventDefault();
        shareStation(station);
    } else {
        playStation(station);
    }
});

// Improved playback handling
function playStation(station) {
    if (!station?.url) {
        showError('Invalid station URL');
        return;
    }

    // Stop previous playback
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
        .catch(error => {
            console.error('Playback error details:', error);
            showError(`Couldn't play station: ${error.message}`);
        });
}

// Favorite system
function toggleFavorite(station) {
    const index = favorites.findIndex(f => f.url === station.url);
    
    if (index === -1) {
        favorites.push(station);
        showNotification('Added to favorites');
    } else {
        favorites.splice(index, 1);
        showNotification('Removed from favorites');
    }
    
    localStorage.setItem('radioFavorites', JSON.stringify(favorites));
    updateFavoriteButtons();
    
    if (currentView === 'favorites') {
        renderStations(favorites);
    }
}

function updateFavoriteButtons() {
    document.querySelectorAll('.station-item').forEach(item => {
        const btn = item.querySelector('.favorite-btn');
        const isFavorite = favorites.some(f => f.url === item.dataset.stationId);
        btn.classList.toggle('active', isFavorite);
        btn.querySelector('path').style.fill = isFavorite ? 'var(--primary)' : 'currentColor';
    });
}

// Tab system
document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
        const tab = button.id.replace('Tab', '').toLowerCase();
        showTab(tab);
    });
});

function showTab(tab) {
    currentView = tab;
    document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
    document.getElementById(`${tab}Tab`).classList.add('active');

    document.getElementById('stationList').style.display = tab === 'about' ? 'none' : 'block';
    document.getElementById('aboutContent').style.display = tab === 'about' ? 'block' : 'none';
    document.getElementById('searchInput').style.display = tab === 'about' ? 'none' : 'block';

    if (tab === 'favorites') renderStations(favorites);
    if (tab === 'all') renderStations(customStations);
}

// Render stations
function renderStations(stations) {
    const stationList = document.getElementById('stationList');
    stationList.innerHTML = '';
    
    if (stations.length === 0) {
        stationList.innerHTML = '<div class="no-results">No stations found</div>';
        return;
    }

    stations.forEach(station => {
        stationList.appendChild(createStationItem(station));
    });

    updateFavoriteButtons();
}

// Player controls
function togglePlayback() {
    if (audio.paused) {
        audio.play()
            .then(() => updatePlayButton(true))
            .catch(error => showError(`Resume failed: ${error.message}`));
    } else {
        audio.pause();
        updatePlayButton(false);
    }
}

function updatePlayButton(playing) {
    document.getElementById('playIcon').style.display = playing ? 'none' : 'block';
    document.getElementById('pauseIcon').style.display = playing ? 'block' : 'none';
    document.getElementById('playerArtwork').classList.toggle('playing', playing);
}

// Initialization
document.getElementById('playPauseBtn').addEventListener('click', togglePlayback);
loadStations();

// Helper functions
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'notification error';
    errorDiv.innerHTML = `
        <i class="fas fa-exclamation-circle"></i>
        ${message}
    `;
    document.body.appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 5000);
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.innerHTML = `
        <i class="fas fa-check-circle"></i>
        ${message}
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}
