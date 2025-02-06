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
        console.log('Stations loaded:', customStations);
    } catch (error) {
        console.error('Error loading stations:', error);
        showError('Failed to load stations. Please refresh the page.');
    }
}

// Initialize stations
function initStations() {
    const stationList = document.getElementById('stationList');
    stationList.innerHTML = '';
    
    customStations.forEach(station => {
        stationList.appendChild(createStationItem(station));
    });
    
    updateFavoriteButtons();
}

// Create station DOM element
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

// Event delegation for station clicks
document.getElementById('stationList').addEventListener('click', (e) => {
    const stationItem = e.target.closest('.station-item');
    if (!stationItem) return;

    const stationUrl = stationItem.dataset.stationUrl;
    const station = customStations.find(s => s.url === stationUrl);
    
    if (e.target.closest('.favorite-btn')) {
        toggleFavorite(station);
    } else if (e.target.closest('.share-btn')) {
        shareStation(station);
    } else {
        playStation(station);
    }
});

// Play station function
function playStation(station) {
    if (currentStation?.url === station.url) {
        togglePlayback();
        return;
    }

    currentStation = station;
    audio.src = station.url;
    
    audio.play()
        .then(() => {
            updatePlayButton(true);
            updatePlayerArtwork(station.logo);
            updatePlayerInfo(station.name);
            startMetadataFetch();
        })
        .catch(error => {
            console.error('Playback error:', error);
            showError('Could not play station. Please try another one.');
        });
}

// Rest of the functions (toggleFavorite, updatePlayerArtwork, etc.)
// ... [Keep all other functions from previous version unchanged] ...

// Initialize the app
loadStations();
document.getElementById('playPauseBtn').addEventListener('click', togglePlayback);

// Error handling
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    document.body.prepend(errorDiv);
    setTimeout(() => errorDiv.remove(), 5000);
}
