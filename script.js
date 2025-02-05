// Define the list of radio stations
const customStations = [
    {
        name: "Amen FM",
        url: "https://ice7.securenetsystems.net/AMENFM",
        logo: "https://i.ibb.co/JWW8zWHy/download-1.jpg",
        genre: "Tamil Christian"
    },
    {   
        name: "Arulvakku FM",
        url: "https://stream.arulvakku.com/radio/8000/radio.mp3",
        logo: "https://i.ibb.co/KYdcq0T/arulvakku-fm.jpg",
        genre: "Tamil Christian"
    },
    {
        name: "Comforter Radio",
        url: "https://s4.radio.co/sd9738032b/listen",
        logo: "https://i.ibb.co/BHpkzR1z/download.webp",
        genre: "Tamil Christian"
    },
    {
        name: "Devaprasannam Radio",
        url: "https://devaprasannam-a9media.radioca.st/stream",
        logo: "https://i.ibb.co/s9nn2W9n/devaprasannam.jpg",
        genre: "Tamil Christian"
    },
    {
        name: "Fgpc FM",
        url: "https://dc1.serverse.com/proxy/fgpcfm/stream",
        logo: "https://i.ibb.co/s9mWj1wD/fgpcfm.jpg",
        genre: "Tamil Christian"
    },
    {
        name: "FM fmkondattam",
        url: "https://dc1.serverse.com/proxy/fgpcfm/stream",
        logo: "https://i.ibb.co/jZwBxd3P/fmkondattam.jpg",
        genre: "Tamil Christian"
    },
    {
        name: "Galeed FM",
        url: "https://eu2.fastcast4u.com/proxy/arunmedi?mp=/1",
        logo: "https://i.ibb.co/ZpYQnpwL/galeed-fm-radio.jpg",
        genre: "Tamil Christian"
    },
    {
        name: "GBTC",
        url: "http://s2.voscast.com:10438/listen",
        logo: "https://i.ibb.co/LDdh50XD/blessing.jpg",
        genre: "Tamil Christian"
    },
    {
        name: "Good News FM",
        url: "https://radio.christvisionmedia.com:8500/stream",
        logo: "https://i.ibb.co/wFKJH6Vr/logo.png",
        genre: "Tamil Christian"
    },
    {
        name: "HOJ Tamil",
        url: "https://dc1.serverse.com/proxy/hojtamil/stream",
        logo: "https://i.ibb.co/jk49VdTX/hand-of-jesus.jpg",
        genre: "Tamil Christian"
    },
    {
        name: "Inbam FM",
        url: "http://stream.radio.co/sf55ced545/listen",
        logo: "https://i.ibb.co/v6QtbHL5/download-2.jpg",
        genre: "Tamil Christian"
    },
    {
        name: "Jehova Rapha",
        url: "https://c22.radioboss.fm:8532/jehovahrapha?1728418667563",
        logo: "https://i.ibb.co/9k1dmv7s/jehovarapha-fm-4-01.jpg",
        genre: "Tamil Christian"
    },
    {
        name: "Kirubai FM",
        url: "http://s4.voscast.com:7110/;stream.mp3",
        logo: "https://i.ibb.co/bRWVDRKn/download-3.jpg",
        genre: "Tamil Christian"
    },
    {
        name: "Lord's Radio",
        url: "https://lordsradio.radioca.st/stream",
        logo: "https://i.ibb.co/mrn9b9S6/Lordradio.png",
        genre: "Tamil Christian"
    },
    {
        name: "O'Zion",
        url: "https://s2.radio.co/sd4968cb05/listen",
        logo: "https://i.ibb.co/8Dbwfhyf/ozionfm.jpg",
        genre: "Tamil Christian"
    },
    {
        name: "Sangamum Radio",
        url: "https://centova71.instainternet.com/proxy/sangamum?mp=/stream",
        logo: "https://i.ibb.co/LhsrfQ4x/f1693f87337881d9dcd102af94ae8c61.jpg",
        genre: "Tamil Christian"
    },
    {
        name: "Theophony Radio",
        url: "https://mediatechnica.com:8002/theophony_tamil.mp3",
        logo: "https://i.ibb.co/Q359qxRV/logo.webp",
        genre: "Tamil Christian"
    },
    {
        name: "Thuthi Fm",
        url: "https://streams.radio.co/s790fe269d/listen",
        logo: "https://i.ibb.co/pvchM6w4/images.jpg",
        genre: "Tamil Christian"
    },
    {
        name: "Uthamiyee",
        url: "https://ssl.aloncast.com:1595/",
        logo: "https://i.ibb.co/qfHdFzv/cropped-600-X600-LOGO-UTHAMIYAE-FM.png",
        genre: "Tamil Christian"
    },
    {
        name: "Vaanmalar FM",
        url: "https://dc1.serverse.com/proxy/vaanmalar2/stream",
        logo: "https://i.ibb.co/fdLCQFzD/vaan-malarfm-thumb.jpg",
        genre: "Tamil Christian"
    },
    {
        name: "Waves of Power",
        url: "https://radio.pixelinmedia.com/vallamai",
        logo: "https://i.ibb.co/8DRtQGTJ/cropped-Logo-vallamai-4.png",
        genre: "Tamil Christian"
    },
];

const audio = new Audio();
let currentStation = null;
let favorites = JSON.parse(localStorage.getItem('radioFavorites')) || [];
let currentView = 'all';
let metadataInterval = null;
let timer = null;

// Theme Toggle
const themeToggle = document.getElementById('themeToggle');
themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    themeToggle.textContent = isLight ? '🌓' : '🌓';
});

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
    
    document.getElementById('stationList').style.display = tab === 'about' ? 'none' : 'block';
    document.getElementById('aboutContent').style.display = tab === 'about' ? 'block' : 'none';
    document.getElementById('searchInput').style.display = tab === 'about' ? 'none' : 'block';
}

// Search Functionality
const searchInput = document.getElementById('searchInput');
searchInput.addEventListener('input', () => {
    const query = searchInput.value.toLowerCase();
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
    favoriteBtn.addEventListener('click', () => toggleFavorite(station));
    stationItem.querySelector('.share-btn').addEventListener('click', () => shareStation(station));
    stationItem.addEventListener('click', () => playStation(station));
    
    return stationItem;
}

function renderStations(stations) {
    const stationList = document.getElementById('stationList');
    stationList.innerHTML = '';
    stations.forEach(station => {
        stationList.appendChild(createStationItem(station));
    });
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
    
    if(currentView === 'favorites') {
        showFavorites();
    }
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
    audio.play();
    updatePlayButton(true);

    // Set the player artwork
    const playerArtwork = document.getElementById('playerArtwork');
    playerArtwork.src = station.logo || '/icons/default-artwork.jpg'; // Fallback to default image

    document.getElementById('playerTitle').textContent = station.name;
    document.getElementById('playerMetadata').textContent = 'Loading metadata...';

    // Start spinning the logo
    playerArtwork.classList.add('playing');

    // Start fetching metadata
    if (metadataInterval) clearInterval(metadataInterval);
    metadataInterval = setInterval(extractMetadata, 5000); // Fetch metadata every 5 seconds
}

function togglePlayback() {
    if(audio.paused) {
        audio.play();
        updatePlayButton(true);
        document.getElementById('playerArtwork').classList.add('playing'); // Resume spinning
    } else {
        audio.pause();
        updatePlayButton(false);
        document.getElementById('playerArtwork').classList.remove('playing'); // Stop spinning
    }
}

function updatePlayButton(playing) {
    document.getElementById('playIcon').style.display = playing ? 'none' : 'block';
    document.getElementById('pauseIcon').style.display = playing ? 'block' : 'none';
}

// Metadata Extraction
function extractMetadata() {
    if (!audio.src || audio.readyState === 0) return;

    fetch(audio.src, {
        method: 'GET',
        headers: {
            'Icy-MetaData': '1' // Request metadata
        }
    })
    .then(response => {
        const icyMetaInt = response.headers.get('icy-metaint');
        if (!icyMetaInt) {
            console.error('Metadata not supported by this stream.');
            return;
        }

        const reader = response.body.getReader();
        let buffer = new Uint8Array();
        let metadataLength = 0;

        const processData = ({ done, value }) => {
            if (done) return;

            buffer = new Uint8Array([...buffer, ...value]);

            if (metadataLength === 0 && buffer.length >= icyMetaInt) {
                // Extract metadata length
                metadataLength = buffer[icyMetaInt] * 16;
                buffer = buffer.slice(icyMetaInt + 1); // Skip metadata length byte
            }

            if (metadataLength > 0 && buffer.length >= metadataLength) {
                // Extract metadata
                const metadataBytes = buffer.slice(0, metadataLength);
                const metadataText = new TextDecoder().decode(metadataBytes);
                const metadata = parseMetadata(metadataText);
                updateMetadataDisplay(metadata);

                // Remove processed metadata from buffer
                buffer = buffer.slice(metadataLength);
                metadataLength = 0;
            }

            // Continue reading the stream
            reader.read().then(processData);
        };

        // Start reading the stream
        reader.read().then(processData);
    })
    .catch(error => {
        console.error('Error fetching metadata:', error);
    });
}

// Parse Metadata
function parseMetadata(metadataText) {
    const metadata = {};
    metadataText.split(';').forEach(part => {
        const [key, value] = part.split('=');
        if (key && value) {
            metadata[key.trim()] = value.trim().replace(/'/g, '');
        }
    });
    return metadata;
}

// Update Metadata Display
function updateMetadataDisplay(metadata) {
    const metadataElement = document.getElementById('playerMetadata');
    if (metadata.StreamTitle) {
        metadataElement.textContent = metadata.StreamTitle;
    } else {
        metadataElement.textContent = 'No metadata available';
    }
}

// Floating Timer
const floatingTimer = document.getElementById('floatingTimer');
const timerIcon = document.getElementById('timerIcon');
const timerMenu = document.getElementById('timerMenu');

// Toggle timer menu
timerIcon.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent the click from reaching the document
    timerMenu.style.display = timerMenu.style.display === 'flex' ? 'none' : 'flex';
});

// Close timer menu when clicking outside
document.addEventListener('click', (e) => {
    if (!floatingTimer.contains(e.target)) {
        timerMenu.style.display = 'none';
    }
});

// Set timer functionality
const timerSelect = document.getElementById('timerSelect');
const setTimerBtn = document.getElementById('setTimerBtn');

setTimerBtn.addEventListener('click', () => {
    const minutes = parseInt(timerSelect.value);
    if (minutes > 0) {
        setTimer(minutes);
    } else {
        clearTimer();
    }
    timerMenu.style.display = 'none'; // Close the menu after setting the timer
});

function setTimer(minutes) {
    clearTimer(); // Clear any existing timer
    timer = setTimeout(() => {
        audio.pause();
        updatePlayButton(false);
        alert("Sleep timer: Playback stopped.");
    }, minutes * 60 * 1000); // Convert minutes to milliseconds
}

function clearTimer() {
    if (timer) {
        clearTimeout(timer);
        timer = null;
    }
}

// Sharing
function shareStation(station) {
    if(navigator.share) {
        navigator.share({
            title: `Listen to ${station.name}`,
            text: "Check out this radio station on TC Radios",
            url: window.location.href
        });
    } else {
        prompt("Copy link to share:", window.location.href);
    }
}

// Initialize
document.getElementById('playPauseBtn').addEventListener('click', togglePlayback);
initStations();

// Make the floating timer button draggable
let isDragging = false;
let offsetX, offsetY;

floatingTimer.addEventListener('mousedown', (e) => {
    isDragging = true;
    offsetX = e.clientX - floatingTimer.getBoundingClientRect().left;
    offsetY = e.clientY - floatingTimer.getBoundingClientRect().top;
    floatingTimer.style.cursor = 'grabbing';
});

document.addEventListener('mousemove', (e) => {
    if (isDragging) {
        const x = e.clientX - offsetX;
        const y = e.clientY - offsetY;

        const maxX = window.innerWidth - floatingTimer.offsetWidth;
        const maxY = window.innerHeight - floatingTimer.offsetHeight;

        floatingTimer.style.left = `${Math.min(Math.max(x, 0), maxX)}px`;
        floatingTimer.style.top = `${Math.min(Math.max(y, 0), maxY)}px`;
    }
});

document.addEventListener('mouseup', () => {
    isDragging = false;
    floatingTimer.style.cursor = 'grab';
});

floatingTimer.addEventListener('touchstart', (e) => {
    isDragging = true;
    const touch = e.touches[0];
    offsetX = touch.clientX - floatingTimer.getBoundingClientRect().left;
    offsetY = touch.clientY - floatingTimer.getBoundingClientRect().top;
    floatingTimer.style.cursor = 'grabbing';
});

document.addEventListener('touchmove', (e) => {
    if (isDragging) {
        const touch = e.touches[0];
        const x = touch.clientX - offsetX;
        const y = touch.clientY - offsetY;

        const maxX = window.innerWidth - floatingTimer.offsetWidth;
        const maxY = window.innerHeight - floatingTimer.offsetHeight;

        floatingTimer.style.left = `${Math.min(Math.max(x, 0), maxX)}px`;
        floatingTimer.style.top = `${Math.min(Math.max(y, 0), maxY)}px`;
    }
});

document.addEventListener('touchend', () => {
    isDragging = false;
    floatingTimer.style.cursor = 'grab';
});
