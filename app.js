(() => {
  "use strict";

  const PLAYLIST_URL =
    "https://raw.githubusercontent.com/simsonpeter/Tcradios/refs/heads/main/stations.json";

  const STORAGE = {
    favorites: "ir_favorites_v1",
    favoriteOrder: "ir_favorite_order_v1",
    recent: "ir_recent_v1",
    queue: "ir_queue_v1",
    theme: "ir_theme_v1",
    volume: "ir_volume_v1",
    muted: "ir_muted_v1",
  };

  const BASE_CATEGORIES = [
    "All",
    "Favorites",
    "Recently Played",
    "Rock",
    "Pop",
    "Christian",
    "News",
    "Tamil",
    "English",
    "Dutch",
    "Other",
  ];

  const PLACEHOLDER_LOGO =
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
        <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#1f2937"/><stop offset="100%" stop-color="#111827"/>
        </linearGradient></defs>
        <rect width="160" height="160" rx="28" fill="url(#g)"/>
        <circle cx="80" cy="72" r="28" fill="none" stroke="#22c55e" stroke-width="6"/>
        <path d="M56 110c10-14 38-14 48 0" fill="none" stroke="#22c55e" stroke-width="6" stroke-linecap="round"/>
      </svg>`
    );

  const state = {
    stations: [],
    filtered: [],
    favorites: new Set(),
    favoriteOrder: [],
    recent: [],
    queue: [],
    category: "All",
    view: "home",
    search: "",
    currentId: null,
    isPlaying: false,
    editFavorites: false,
    menuStationId: null,
    sleepEndsAt: null,
    sleepTimerId: null,
    loading: true,
    error: null,
    systemThemeMq: window.matchMedia
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null,
  };

  const el = {
    app: $("#app"),
    searchToggle: $("#search-toggle"),
    searchPanel: $("#search-panel"),
    searchInput: $("#search-input"),
    searchClear: $("#search-clear"),
    refreshBtn: $("#refresh-btn"),
    settingsBtn: $("#settings-btn"),
    categoryList: $("#category-list"),
    statusArea: $("#status-area"),
    skeleton: $("#skeleton"),
    stationList: $("#station-list"),
    emptyState: $("#empty-state"),
    viewToolbar: $("#view-toolbar"),
    viewHint: $("#view-hint"),
    editFavoritesBtn: $("#edit-favorites-btn"),
    doneFavoritesBtn: $("#done-favorites-btn"),
    clearRecentBtn: $("#clear-recent-btn"),
    clearQueueBtn: $("#clear-queue-btn"),
    miniPlayer: $("#mini-player"),
    miniOpen: $("#mini-open"),
    miniLogo: $("#mini-logo"),
    miniName: $("#mini-name"),
    miniFav: $("#mini-fav"),
    miniPlay: $("#mini-play"),
    fullPlayer: $("#full-player"),
    fpLogo: $("#fp-logo"),
    fpName: $("#fp-name"),
    fpMeta: $("#fp-meta"),
    fpStatus: $("#fp-status"),
    fpTimer: $("#fp-timer"),
    fpPrev: $("#fp-prev"),
    fpNext: $("#fp-next"),
    fpPlay: $("#fp-play"),
    fpMute: $("#fp-mute"),
    fpVolume: $("#fp-volume"),
    fpFav: $("#fp-fav"),
    fpMore: $("#fp-more"),
    visualizer: $("#visualizer"),
    settingsSheet: $("#settings-sheet"),
    themeSelect: $("#theme-select"),
    sleepSelect: $("#sleep-select"),
    moreSheet: $("#more-sheet"),
    moreLogo: $("#more-logo"),
    moreTitle: $("#more-title"),
    moreSub: $("#more-sub"),
    moreActions: $("#more-actions"),
    detailsSheet: $("#details-sheet"),
    detailsBody: $("#details-body"),
    toast: $("#toast"),
    audio: $("#audio"),
    navItems: Array.from(document.querySelectorAll(".nav-item")),
  };

  let toastTimer = null;
  let dragId = null;

  function $(selector) {
    return document.querySelector(selector);
  }

  function safeJsonParse(value, fallback) {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function readStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return safeJsonParse(raw, fallback);
    } catch {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore quota / private mode */
    }
  }

  function showToast(message, ms = 2200) {
    el.toast.textContent = message;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.toast.hidden = true;
    }, ms);
  }

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i += 1) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  function pickField(raw, keys, fallback = "") {
    for (const key of keys) {
      if (raw[key] != null && String(raw[key]).trim() !== "") {
        return String(raw[key]).trim();
      }
    }
    return fallback;
  }

  function normalizeStation(raw, index) {
    if (!raw || typeof raw !== "object") return null;

    const name = pickField(raw, ["name", "title", "station", "stationName"], "");
    const streamUrl = pickField(
      raw,
      ["streamUrl", "url", "stream", "stream_url", "src", "listenurl"],
      ""
    );

    if (!name || !streamUrl) return null;

    const logo = pickField(raw, ["logo", "image", "favicon", "icon", "artwork"], "");
    const country = pickField(raw, ["country", "nation", "location"], "");
    const genre = pickField(raw, ["genre", "category", "tags", "tag"], "Other");
    const description = pickField(raw, ["description", "desc", "info", "about"], "");
    const website = pickField(raw, ["website", "homepage", "site", "web"], "");
    const providedId = pickField(raw, ["id", "stationuuid", "uuid"], "");
    const id = providedId || `st-${slugify(name)}-${hashString(streamUrl + name)}-${index}`;

    return {
      id,
      name,
      streamUrl,
      logo: logo || PLACEHOLDER_LOGO,
      country: country || "Unknown",
      genre: genre || "Other",
      description: description || "",
      website: website || "",
      raw,
    };
  }

  function loadPersistedState() {
    const favs = readStorage(STORAGE.favorites, []);
    state.favorites = new Set(Array.isArray(favs) ? favs.map(String) : []);
    state.favoriteOrder = Array.isArray(readStorage(STORAGE.favoriteOrder, []))
      ? readStorage(STORAGE.favoriteOrder, []).map(String)
      : [];
    state.recent = Array.isArray(readStorage(STORAGE.recent, []))
      ? readStorage(STORAGE.recent, []).map(String)
      : [];
    state.queue = Array.isArray(readStorage(STORAGE.queue, []))
      ? readStorage(STORAGE.queue, []).map(String)
      : [];

    const theme = readStorage(STORAGE.theme, "dark");
    el.themeSelect.value = ["dark", "light", "system"].includes(theme) ? theme : "dark";
    applyTheme(el.themeSelect.value);

    const volume = Number(readStorage(STORAGE.volume, 1));
    el.audio.volume = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 1;
    el.fpVolume.value = String(el.audio.volume);
    el.audio.muted = Boolean(readStorage(STORAGE.muted, false));
    updateMuteUI();
  }

  function applyTheme(mode) {
    const resolved =
      mode === "system"
        ? state.systemThemeMq && state.systemThemeMq.matches === false
          ? "light"
          : "dark"
        : mode;
    document.documentElement.setAttribute("data-theme", resolved);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = resolved === "light" ? "#f4f7fb" : "#0b0f14";
  }

  async function fetchStations({ silent = false } = {}) {
    if (!silent) {
      state.loading = true;
      state.error = null;
      renderStatus();
    }

    try {
      const response = await fetch(PLAYLIST_URL, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error("Playlist is not an array");

      const normalized = data
        .map((item, index) => normalizeStation(item, index))
        .filter(Boolean);

      if (!normalized.length) throw new Error("No valid stations found");

      state.stations = normalized;
      prunePersistedIds();
      state.loading = false;
      state.error = null;
      buildCategories();
      applyFilters();
      renderAll();
      return true;
    } catch (err) {
      console.error("Playlist load failed:", err);
      state.loading = false;
      state.error = "Unable to load radio stations.";
      if (!state.stations.length) {
        renderStatus();
      } else {
        showToast("Unable to refresh playlist");
      }
      return false;
    }
  }

  function prunePersistedIds() {
    const ids = new Set(state.stations.map((s) => s.id));
    state.favorites = new Set([...state.favorites].filter((id) => ids.has(id)));
    state.favoriteOrder = state.favoriteOrder.filter((id) => ids.has(id));
    state.recent = state.recent.filter((id) => ids.has(id));
    state.queue = state.queue.filter((id) => ids.has(id));
    persistFavorites();
    writeStorage(STORAGE.recent, state.recent);
    writeStorage(STORAGE.queue, state.queue);
  }

  function persistFavorites() {
    writeStorage(STORAGE.favorites, [...state.favorites]);
    const ordered = [
      ...state.favoriteOrder.filter((id) => state.favorites.has(id)),
      ...[...state.favorites].filter((id) => !state.favoriteOrder.includes(id)),
    ];
    state.favoriteOrder = ordered;
    writeStorage(STORAGE.favoriteOrder, ordered);
  }

  function getStationById(id) {
    return state.stations.find((s) => s.id === id) || null;
  }

  function getFavoritesStations() {
    const map = new Map(state.stations.map((s) => [s.id, s]));
    const ordered = state.favoriteOrder
      .map((id) => map.get(id))
      .filter(Boolean);
    const extras = [...state.favorites]
      .filter((id) => !state.favoriteOrder.includes(id))
      .map((id) => map.get(id))
      .filter(Boolean);
    return [...ordered, ...extras];
  }

  function getRecentStations() {
    const map = new Map(state.stations.map((s) => [s.id, s]));
    return state.recent.map((id) => map.get(id)).filter(Boolean);
  }

  function getQueueStations() {
    const map = new Map(state.stations.map((s) => [s.id, s]));
    return state.queue.map((id) => map.get(id)).filter(Boolean);
  }

  function stationMatchesCategory(station, category) {
    if (category === "All") return true;
    if (category === "Favorites") return state.favorites.has(station.id);
    if (category === "Recently Played") return state.recent.includes(station.id);

    const hay = `${station.genre} ${station.name} ${station.description} ${station.country}`.toLowerCase();
    if (category === "Other") {
      const known = ["rock", "pop", "christian", "news", "tamil", "english", "dutch"];
      return !known.some((k) => hay.includes(k));
    }
    return hay.includes(category.toLowerCase());
  }

  function stationMatchesSearch(station, query) {
    if (!query) return true;
    const q = query.toLowerCase();
    return [station.name, station.country, station.genre, station.description]
      .join(" ")
      .toLowerCase()
      .includes(q);
  }

  function getActiveSourceStations() {
    if (state.view === "favorites") return getFavoritesStations();
    if (state.view === "recent") return getRecentStations();
    if (state.view === "queue") return getQueueStations();

    if (state.category === "Favorites") return getFavoritesStations();
    if (state.category === "Recently Played") return getRecentStations();
    return state.stations.filter((s) => stationMatchesCategory(s, state.category));
  }

  function applyFilters() {
    const source = getActiveSourceStations();
    state.filtered = source.filter((s) => stationMatchesSearch(s, state.search));
  }

  function buildCategories() {
    const dynamic = new Set();
    for (const station of state.stations) {
      const parts = station.genre.split(/[,/|&]+/).map((p) => p.trim()).filter(Boolean);
      for (const part of parts) {
        const words = part.split(/\s+/);
        for (const word of words) {
          const clean = word.replace(/[^a-zA-Z]/g, "");
          if (!clean) continue;
          const title = clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
          if (BASE_CATEGORIES.includes(title) || title.length > 2) {
            if (["Rock", "Pop", "Christian", "News", "Tamil", "English", "Dutch"].includes(title)) {
              dynamic.add(title);
            }
          }
        }
      }
      if (/tamil/i.test(station.name + station.genre)) dynamic.add("Tamil");
      if (/christian|gospel|praise/i.test(station.name + station.genre)) dynamic.add("Christian");
    }

    const cats = [
      "All",
      "Favorites",
      "Recently Played",
      ...["Rock", "Pop", "Christian", "News", "Tamil", "English", "Dutch"].filter(
        (c) => dynamic.has(c) || BASE_CATEGORIES.includes(c)
      ),
      "Other",
    ];

    // Keep requested chips even if sparse; still generate intelligently where possible.
    const unique = [...new Set(cats)];
    el.categoryList.innerHTML = unique
      .map(
        (cat) =>
          `<button type="button" class="chip${cat === state.category ? " active" : ""}" role="tab" aria-selected="${
            cat === state.category
          }" data-category="${escapeAttr(cat)}">${escapeHtml(cat)}</button>`
      )
      .join("");
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/'/g, "&#39;");
  }

  function renderStatus() {
    if (state.loading && !state.stations.length) {
      el.statusArea.hidden = false;
      el.skeleton.hidden = false;
      el.stationList.hidden = true;
      el.emptyState.hidden = true;
      return;
    }

    if (state.error && !state.stations.length) {
      el.statusArea.hidden = false;
      el.skeleton.hidden = true;
      el.stationList.hidden = true;
      el.emptyState.hidden = true;
      el.statusArea.innerHTML = `
        <div class="error-state">
          <h2>Unable to load radio stations.</h2>
          <p>Check your connection and try again.</p>
          <div class="error-actions">
            <button type="button" class="primary-btn" id="retry-btn">Retry</button>
            <button type="button" class="secondary-btn" id="retry-refresh-btn">Refresh playlist</button>
          </div>
        </div>`;
      $("#retry-btn")?.addEventListener("click", () => fetchStations());
      $("#retry-refresh-btn")?.addEventListener("click", () => refreshPlaylist());
      return;
    }

    el.statusArea.hidden = true;
    el.statusArea.innerHTML = `<div class="skeleton-grid" id="skeleton" aria-hidden="true" hidden></div>`;
  }

  function renderToolbar() {
    const showFavTools = state.view === "favorites" || state.category === "Favorites";
    const showRecent = state.view === "recent" || state.category === "Recently Played";
    const showQueue = state.view === "queue";

    if (!showFavTools && !showRecent && !showQueue) {
      el.viewToolbar.hidden = true;
      return;
    }

    el.viewToolbar.hidden = false;
    el.editFavoritesBtn.hidden = !showFavTools || state.editFavorites;
    el.doneFavoritesBtn.hidden = !showFavTools || !state.editFavorites;
    el.clearRecentBtn.hidden = !showRecent;
    el.clearQueueBtn.hidden = !showQueue;

    if (showFavTools) {
      el.viewHint.textContent = state.editFavorites
        ? "Drag favorites to reorder, then tap Done."
        : `${getFavoritesStations().length} favorite stations`;
    } else if (showRecent) {
      el.viewHint.textContent = `${getRecentStations().length} recently played`;
    } else if (showQueue) {
      el.viewHint.textContent = `${getQueueStations().length} in queue`;
    }
  }

  function renderStations() {
    renderStatus();
    if (state.loading && !state.stations.length) return;
    if (state.error && !state.stations.length) return;

    applyFilters();
    renderToolbar();

    if (!state.filtered.length) {
      el.stationList.hidden = true;
      el.emptyState.hidden = false;
      el.emptyState.innerHTML = getEmptyStateHtml();
      bindEmptyActions();
      return;
    }

    el.emptyState.hidden = true;
    el.stationList.hidden = false;

    const canDrag =
      state.editFavorites &&
      (state.view === "favorites" || state.category === "Favorites");

    el.stationList.innerHTML = state.filtered
      .map((station) => {
        const isFav = state.favorites.has(station.id);
        const playing = state.currentId === station.id && state.isPlaying;
        return `
          <article class="station-card${playing ? " playing" : ""}${canDrag ? " editable" : ""}" data-id="${escapeAttr(
            station.id
          )}" ${canDrag ? 'draggable="true"' : ""} tabindex="0" role="button" aria-label="Play ${escapeAttr(
            station.name
          )}">
            ${canDrag ? '<span class="drag-handle" aria-hidden="true" title="Drag to reorder">⠿</span>' : ""}
            <img class="station-logo" src="${PLACEHOLDER_LOGO}" data-src="${escapeAttr(
              station.logo
            )}" alt="${escapeAttr(station.name)} logo" loading="lazy" width="72" height="72" />
            <div class="station-info">
              <h3>${escapeHtml(station.name)}</h3>
              <p>${escapeHtml(station.genre)} • ${escapeHtml(station.country)}</p>
            </div>
            <div class="station-actions">
              <button type="button" class="icon-btn fav-btn${isFav ? " active" : ""}" data-action="favorite" aria-label="${
                isFav ? "Remove from favorites" : "Add to favorites"
              }">${isFav ? "♥" : "♡"}</button>
              <button type="button" class="icon-btn play-btn" data-action="play" aria-label="Play ${escapeAttr(
                station.name
              )}">${playing ? "❚❚" : "▶"}</button>
              <button type="button" class="icon-btn" data-action="more" aria-label="More options for ${escapeAttr(
                station.name
              )}">⋯</button>
            </div>
          </article>`;
      })
      .join("");

    lazyLoadImages(el.stationList);
    bindStationEvents();
  }

  function getEmptyStateHtml() {
    if (state.view === "favorites" || state.category === "Favorites") {
      return `
        <h2>No favorite stations yet.</h2>
        <p>Tap the heart on any station to save it here.</p>
        <div class="empty-actions">
          <button type="button" class="primary-btn" data-empty="browse">Browse Stations</button>
        </div>`;
    }
    if (state.view === "recent" || state.category === "Recently Played") {
      return `
        <h2>No recently played stations.</h2>
        <p>Stations you play will appear here.</p>
        <div class="empty-actions">
          <button type="button" class="primary-btn" data-empty="browse">Browse Stations</button>
        </div>`;
    }
    if (state.view === "queue") {
      return `
        <h2>Your queue is empty.</h2>
        <p>Add stations from the more menu.</p>
        <div class="empty-actions">
          <button type="button" class="primary-btn" data-empty="browse">Browse Stations</button>
        </div>`;
    }
    if (state.search) {
      return `
        <h2>No stations match your search.</h2>
        <p>Try another name, genre, or country.</p>`;
    }
    return `
      <h2>No stations found.</h2>
      <p>Try another category or refresh the playlist.</p>
      <div class="empty-actions">
        <button type="button" class="primary-btn" data-empty="refresh">Refresh playlist</button>
      </div>`;
  }

  function bindEmptyActions() {
    el.emptyState.querySelector('[data-empty="browse"]')?.addEventListener("click", () => {
      setView("home");
      state.category = "All";
      buildCategories();
      renderStations();
    });
    el.emptyState.querySelector('[data-empty="refresh"]')?.addEventListener("click", () => {
      refreshPlaylist();
    });
  }

  function lazyLoadImages(root) {
    const images = root.querySelectorAll("img[data-src]");
    if (!("IntersectionObserver" in window)) {
      images.forEach((img) => {
        img.src = img.dataset.src;
      });
      return;
    }
    const io = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const img = entry.target;
          const src = img.dataset.src;
          if (src) {
            img.src = src;
            img.onerror = () => {
              img.onerror = null;
              img.src = PLACEHOLDER_LOGO;
            };
          }
          observer.unobserve(img);
        });
      },
      { rootMargin: "120px" }
    );
    images.forEach((img) => io.observe(img));
  }

  function bindStationEvents() {
    el.stationList.querySelectorAll(".station-card").forEach((card) => {
      const id = card.dataset.id;

      card.addEventListener("click", (event) => {
        const actionBtn = event.target.closest("[data-action]");
        if (actionBtn) {
          event.stopPropagation();
          const action = actionBtn.dataset.action;
          if (action === "favorite") toggleFavorite(id);
          if (action === "play") playStation(id);
          if (action === "more") openMoreMenu(id);
          return;
        }
        if (state.editFavorites && (state.view === "favorites" || state.category === "Favorites")) {
          return;
        }
        playStation(id);
      });

      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          playStation(id);
        }
      });

      card.addEventListener("dragstart", (event) => {
        if (!card.draggable) return;
        dragId = id;
        card.classList.add("dragging");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", id);
      });

      card.addEventListener("dragend", () => {
        card.classList.remove("dragging");
        dragId = null;
        el.stationList.querySelectorAll(".drag-over").forEach((n) => n.classList.remove("drag-over"));
      });

      card.addEventListener("dragover", (event) => {
        if (!dragId || dragId === id) return;
        event.preventDefault();
        card.classList.add("drag-over");
      });

      card.addEventListener("dragleave", () => card.classList.remove("drag-over"));

      card.addEventListener("drop", (event) => {
        event.preventDefault();
        card.classList.remove("drag-over");
        const fromId = dragId || event.dataTransfer.getData("text/plain");
        if (!fromId || fromId === id) return;
        reorderFavorite(fromId, id);
      });
    });
  }

  function reorderFavorite(fromId, toId) {
    const list = getFavoritesStations().map((s) => s.id);
    const fromIndex = list.indexOf(fromId);
    const toIndex = list.indexOf(toId);
    if (fromIndex < 0 || toIndex < 0) return;
    list.splice(fromIndex, 1);
    list.splice(toIndex, 0, fromId);
    state.favoriteOrder = list;
    writeStorage(STORAGE.favoriteOrder, list);
    renderStations();
    showToast("Favorite order updated");
  }

  function toggleFavorite(id) {
    if (state.favorites.has(id)) {
      state.favorites.delete(id);
      state.favoriteOrder = state.favoriteOrder.filter((x) => x !== id);
      showToast("Removed from favorites");
    } else {
      state.favorites.add(id);
      if (!state.favoriteOrder.includes(id)) state.favoriteOrder.push(id);
      showToast("Added to favorites");
    }
    persistFavorites();
    updatePlayerFavoriteUI();
    buildCategories();
    renderStations();
    if (state.menuStationId === id) openMoreMenu(id, true);
  }

  function addToRecent(id) {
    state.recent = [id, ...state.recent.filter((x) => x !== id)].slice(0, 20);
    writeStorage(STORAGE.recent, state.recent);
  }

  function addToQueue(id) {
    if (!state.queue.includes(id)) {
      state.queue.push(id);
      writeStorage(STORAGE.queue, state.queue);
      showToast("Added to queue");
    } else {
      showToast("Already in queue");
    }
    if (state.view === "queue") renderStations();
  }

  function removeFromQueue(id) {
    state.queue = state.queue.filter((x) => x !== id);
    writeStorage(STORAGE.queue, state.queue);
    showToast("Removed from queue");
    if (state.view === "queue") renderStations();
  }

  function clearQueue() {
    state.queue = [];
    writeStorage(STORAGE.queue, []);
    showToast("Queue cleared");
    renderStations();
  }

  function clearRecent() {
    state.recent = [];
    writeStorage(STORAGE.recent, []);
    showToast("Recently played cleared");
    renderStations();
  }

  function clearFavorites() {
    state.favorites = new Set();
    state.favoriteOrder = [];
    persistFavorites();
    showToast("Favorites cleared");
    buildCategories();
    renderStations();
  }

  async function playStation(id) {
    const station = getStationById(id);
    if (!station) {
      showToast("Station not found");
      return;
    }

    state.currentId = id;
    addToRecent(id);
    updatePlayerUI();
    el.miniPlayer.hidden = false;
    el.fpStatus.textContent = "Connecting…";
    setPlayingUI(false);

    try {
      el.audio.pause();
      el.audio.removeAttribute("src");
      el.audio.load();
      el.audio.src = station.streamUrl;
      el.audio.load();
      const playPromise = el.audio.play();
      if (playPromise) await playPromise;
      state.isPlaying = true;
      setPlayingUI(true);
      el.fpStatus.textContent = "Playing";
      renderStations();
    } catch (err) {
      console.error("Playback error:", err);
      state.isPlaying = false;
      setPlayingUI(false);
      el.fpStatus.textContent = "Unable to play this station. Please try again.";
      showToast("Unable to play this station. Please try again.");
      maybePlayNextFromQueue();
    }
  }

  function pauseStation() {
    el.audio.pause();
    state.isPlaying = false;
    setPlayingUI(false);
    el.fpStatus.textContent = "Paused";
    renderStations();
  }

  function togglePlayPause() {
    if (!state.currentId) {
      const first = state.filtered[0] || state.stations[0];
      if (first) playStation(first.id);
      return;
    }
    if (state.isPlaying) pauseStation();
    else playStation(state.currentId);
  }

  function getPlaybackList() {
    if (state.filtered.length) return state.filtered;
    return state.stations;
  }

  function playRelative(offset) {
    const list = getPlaybackList();
    if (!list.length) return;
    const currentIndex = Math.max(
      0,
      list.findIndex((s) => s.id === state.currentId)
    );
    const nextIndex = (currentIndex + offset + list.length) % list.length;
    playStation(list[nextIndex].id);
  }

  function maybePlayNextFromQueue() {
    if (!state.queue.length) return;
    const nextId = state.queue.find((id) => id !== state.currentId) || state.queue[0];
    if (!nextId) return;
    // Optional auto-advance on failure/stop
    setTimeout(() => {
      if (!state.isPlaying) {
        showToast("Playing next from queue");
        playStation(nextId);
      }
    }, 600);
  }

  function setPlayingUI(playing) {
    el.visualizer.classList.toggle("active", playing);
    el.miniPlay.textContent = playing ? "❚❚" : "▶";
    el.fpPlay.textContent = playing ? "❚❚" : "▶";
    el.miniPlay.setAttribute("aria-label", playing ? "Pause" : "Play");
    el.fpPlay.setAttribute("aria-label", playing ? "Pause" : "Play");
  }

  function updatePlayerFavoriteUI() {
    const active = state.currentId && state.favorites.has(state.currentId);
    el.miniFav.classList.toggle("active", Boolean(active));
    el.fpFav.classList.toggle("active", Boolean(active));
    el.miniFav.textContent = active ? "♥" : "♡";
    el.fpFav.textContent = active ? "♥" : "♡";
  }

  function updateMuteUI() {
    el.fpMute.textContent = el.audio.muted || el.audio.volume === 0 ? "🔇" : "🔊";
  }

  function updatePlayerUI() {
    const station = getStationById(state.currentId);
    if (!station) return;
    el.miniLogo.src = station.logo || PLACEHOLDER_LOGO;
    el.miniLogo.alt = `${station.name} logo`;
    el.miniName.textContent = station.name;
    el.fpLogo.src = station.logo || PLACEHOLDER_LOGO;
    el.fpLogo.alt = `${station.name} logo`;
    el.fpName.textContent = station.name;
    el.fpMeta.textContent = `${station.genre} • ${station.country}`;
    updatePlayerFavoriteUI();
  }

  function openSheet(id) {
    const node = document.getElementById(id);
    if (!node) return;
    node.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeSheet(id) {
    const node = document.getElementById(id);
    if (!node) return;
    node.hidden = true;
    if (
      el.fullPlayer.hidden &&
      el.settingsSheet.hidden &&
      el.moreSheet.hidden &&
      el.detailsSheet.hidden
    ) {
      document.body.style.overflow = "";
    }
  }

  function closeTopSheet() {
    if (!el.detailsSheet.hidden) return closeSheet("details-sheet");
    if (!el.moreSheet.hidden) return closeSheet("more-sheet");
    if (!el.settingsSheet.hidden) return closeSheet("settings-sheet");
    if (!el.fullPlayer.hidden) return closeSheet("full-player");
    if (!el.searchPanel.hidden) {
      el.searchPanel.hidden = true;
      el.searchToggle.setAttribute("aria-expanded", "false");
    }
  }

  function openMoreMenu(id, refreshOnly = false) {
    const station = getStationById(id);
    if (!station) return;
    state.menuStationId = id;
    const isFav = state.favorites.has(id);
    const inQueue = state.queue.includes(id);

    el.moreLogo.src = station.logo || PLACEHOLDER_LOGO;
    el.moreLogo.alt = `${station.name} logo`;
    el.moreTitle.textContent = station.name;
    el.moreSub.textContent = `${station.genre} • ${station.country}`;

    const actions = [
      { key: "play", label: "Play", icon: "▶" },
      {
        key: isFav ? "unfav" : "fav",
        label: isFav ? "Remove from Favorites" : "Add to Favorites",
        icon: isFav ? "♥" : "♡",
      },
      {
        key: inQueue ? "dequeue" : "queue",
        label: inQueue ? "Remove from Queue" : "Add to Queue",
        icon: "☰",
      },
      { key: "share", label: "Share Station", icon: "↗" },
      { key: "copy", label: "Copy Stream URL", icon: "⧉" },
      { key: "open", label: "Open Stream URL", icon: "🔗" },
      { key: "details", label: "View Station Details", icon: "ℹ" },
    ];

    el.moreActions.innerHTML = actions
      .map(
        (a) => `
        <button type="button" class="menu-item" data-more="${a.key}">
          <span class="menu-icon" aria-hidden="true">${a.icon}</span>
          <span>${a.label}</span>
        </button>`
      )
      .join("");

    el.moreActions.querySelectorAll("[data-more]").forEach((btn) => {
      btn.addEventListener("click", () => handleMoreAction(btn.dataset.more, id));
    });

    if (!refreshOnly) openSheet("more-sheet");
  }

  async function handleMoreAction(action, id) {
    const station = getStationById(id);
    if (!station) return;

    switch (action) {
      case "play":
        closeSheet("more-sheet");
        playStation(id);
        break;
      case "fav":
      case "unfav":
        toggleFavorite(id);
        break;
      case "queue":
        addToQueue(id);
        openMoreMenu(id, true);
        break;
      case "dequeue":
        removeFromQueue(id);
        openMoreMenu(id, true);
        break;
      case "share":
        await shareStation(station);
        break;
      case "copy":
        await copyText(station.streamUrl, "Station link copied");
        break;
      case "open":
        window.open(station.streamUrl, "_blank", "noopener,noreferrer");
        break;
      case "details":
        closeSheet("more-sheet");
        openDetails(station);
        break;
      default:
        break;
    }
  }

  function openDetails(station) {
    el.detailsBody.innerHTML = `
      <div class="more-station" style="margin-bottom:1rem">
        <img src="${escapeAttr(station.logo || PLACEHOLDER_LOGO)}" alt="${escapeAttr(
          station.name
        )} logo" width="64" height="64" style="width:64px;height:64px;border-radius:16px;object-fit:cover" />
        <div>
          <strong>${escapeHtml(station.name)}</strong>
          <p class="muted">${escapeHtml(station.genre)} • ${escapeHtml(station.country)}</p>
        </div>
      </div>
      <dl>
        <div><dt>Description</dt><dd>${escapeHtml(station.description || "No description available.")}</dd></div>
        <div><dt>Stream URL</dt><dd>${escapeHtml(station.streamUrl)}</dd></div>
        <div><dt>Website</dt><dd>${
          station.website
            ? `<a href="${escapeAttr(station.website)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
                station.website
              )}</a>`
            : "Not available"
        }</dd></div>
      </dl>`;
    openSheet("details-sheet");
  }

  async function shareStation(station) {
    const shareData = {
      title: station.name,
      text: `Listen to ${station.name} on Internet Radio`,
      url: station.streamUrl || window.location.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
    } catch (err) {
      if (err && err.name === "AbortError") return;
    }
    const payload = `${station.name}\n${station.streamUrl}\n${window.location.href}`;
    await copyText(payload, "Station link copied");
  }

  async function copyText(text, toastMessage) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      showToast(toastMessage || "Copied");
    } catch {
      showToast("Unable to copy");
    }
  }

  async function refreshPlaylist() {
    const ok = await fetchStations({ silent: Boolean(state.stations.length) });
    if (ok) showToast("Playlist updated");
  }

  function setView(view) {
    state.view = view;
    state.editFavorites = false;
    el.navItems.forEach((btn) => {
      const active = btn.dataset.view === view;
      btn.classList.toggle("active", active);
      if (active) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    });

    if (view === "settings") {
      openSheet("settings-sheet");
      return;
    }

    if (view === "home") {
      // keep category
    } else if (view === "favorites") {
      state.category = "Favorites";
    } else if (view === "recent") {
      state.category = "Recently Played";
    }

    buildCategories();
    renderStations();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setSleepTimer(minutes) {
    if (state.sleepTimerId) {
      clearInterval(state.sleepTimerId);
      state.sleepTimerId = null;
    }
    if (!minutes) {
      state.sleepEndsAt = null;
      el.fpTimer.hidden = true;
      showToast("Sleep timer off");
      return;
    }
    state.sleepEndsAt = Date.now() + minutes * 60 * 1000;
    el.fpTimer.hidden = false;
    updateSleepUI();
    state.sleepTimerId = setInterval(() => {
      if (!state.sleepEndsAt) return;
      const remaining = state.sleepEndsAt - Date.now();
      if (remaining <= 0) {
        clearInterval(state.sleepTimerId);
        state.sleepTimerId = null;
        state.sleepEndsAt = null;
        el.fpTimer.hidden = true;
        pauseStation();
        el.sleepSelect.value = "0";
        showToast("Sleep timer finished");
        return;
      }
      updateSleepUI();
    }, 1000);
    showToast(`Sleep timer set: ${minutes} min`);
  }

  function updateSleepUI() {
    if (!state.sleepEndsAt) {
      el.fpTimer.hidden = true;
      return;
    }
    const remaining = Math.max(0, state.sleepEndsAt - Date.now());
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    el.fpTimer.hidden = false;
    el.fpTimer.textContent = `Sleep timer: ${mins}:${String(secs).padStart(2, "0")}`;
  }

  function renderAll() {
    buildCategories();
    renderStations();
    if (state.currentId) {
      el.miniPlayer.hidden = false;
      updatePlayerUI();
    }
  }

  function isTypingTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    return (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      target.isContentEditable
    );
  }

  function bindEvents() {
    el.searchToggle.addEventListener("click", () => {
      const open = el.searchPanel.hidden;
      el.searchPanel.hidden = !open;
      el.searchToggle.setAttribute("aria-expanded", String(open));
      if (open) el.searchInput.focus();
    });

    el.searchInput.addEventListener("input", () => {
      state.search = el.searchInput.value.trim();
      el.searchClear.hidden = !state.search;
      renderStations();
    });

    el.searchClear.addEventListener("click", () => {
      el.searchInput.value = "";
      state.search = "";
      el.searchClear.hidden = true;
      renderStations();
      el.searchInput.focus();
    });

    el.refreshBtn.addEventListener("click", () => refreshPlaylist());
    el.settingsBtn.addEventListener("click", () => openSheet("settings-sheet"));

    el.categoryList.addEventListener("click", (event) => {
      const chip = event.target.closest("[data-category]");
      if (!chip) return;
      state.category = chip.dataset.category;
      state.view = "home";
      state.editFavorites = false;
      el.navItems.forEach((btn) => {
        const active = btn.dataset.view === "home";
        btn.classList.toggle("active", active);
      });
      if (state.category === "Favorites") {
        /* stay on home with favorites filter */
      }
      buildCategories();
      renderStations();
    });

    el.navItems.forEach((btn) => {
      btn.addEventListener("click", () => setView(btn.dataset.view));
    });

    el.editFavoritesBtn.addEventListener("click", () => {
      state.editFavorites = true;
      renderStations();
    });
    el.doneFavoritesBtn.addEventListener("click", () => {
      state.editFavorites = false;
      persistFavorites();
      showToast("Favorite order saved");
      renderStations();
    });
    el.clearRecentBtn.addEventListener("click", () => clearRecent());
    el.clearQueueBtn.addEventListener("click", () => clearQueue());

    el.miniOpen.addEventListener("click", () => openSheet("full-player"));
    el.miniPlay.addEventListener("click", (e) => {
      e.stopPropagation();
      togglePlayPause();
    });
    el.miniFav.addEventListener("click", (e) => {
      e.stopPropagation();
      if (state.currentId) toggleFavorite(state.currentId);
    });

    el.fpPlay.addEventListener("click", () => togglePlayPause());
    el.fpPrev.addEventListener("click", () => playRelative(-1));
    el.fpNext.addEventListener("click", () => playRelative(1));
    el.fpFav.addEventListener("click", () => {
      if (state.currentId) toggleFavorite(state.currentId);
    });
    el.fpMore.addEventListener("click", () => {
      if (state.currentId) openMoreMenu(state.currentId);
    });
    el.fpMute.addEventListener("click", () => {
      el.audio.muted = !el.audio.muted;
      writeStorage(STORAGE.muted, el.audio.muted);
      updateMuteUI();
    });
    el.fpVolume.addEventListener("input", () => {
      const value = Number(el.fpVolume.value);
      el.audio.volume = value;
      if (value > 0 && el.audio.muted) el.audio.muted = false;
      writeStorage(STORAGE.volume, value);
      writeStorage(STORAGE.muted, el.audio.muted);
      updateMuteUI();
    });

    document.querySelectorAll("[data-close]").forEach((node) => {
      node.addEventListener("click", () => closeSheet(node.dataset.close));
    });

    el.themeSelect.addEventListener("change", () => {
      writeStorage(STORAGE.theme, el.themeSelect.value);
      applyTheme(el.themeSelect.value);
      showToast("Theme updated");
    });

    el.sleepSelect.addEventListener("change", () => {
      setSleepTimer(Number(el.sleepSelect.value) || 0);
    });

    $("#settings-refresh")?.addEventListener("click", () => refreshPlaylist());
    $("#settings-clear-favorites")?.addEventListener("click", () => {
      clearFavorites();
    });
    $("#settings-clear-recent")?.addEventListener("click", () => clearRecent());
    $("#settings-clear-queue")?.addEventListener("click", () => clearQueue());

    el.audio.addEventListener("playing", () => {
      state.isPlaying = true;
      setPlayingUI(true);
      el.fpStatus.textContent = "Playing";
    });
    el.audio.addEventListener("pause", () => {
      if (!el.audio.ended) {
        state.isPlaying = false;
        setPlayingUI(false);
        if (el.fpStatus.textContent !== "Unable to play this station. Please try again.") {
          el.fpStatus.textContent = "Paused";
        }
      }
    });
    el.audio.addEventListener("waiting", () => {
      el.fpStatus.textContent = "Buffering…";
    });
    el.audio.addEventListener("error", () => {
      state.isPlaying = false;
      setPlayingUI(false);
      el.fpStatus.textContent = "Unable to play this station. Please try again.";
      showToast("Unable to play this station. Please try again.");
      maybePlayNextFromQueue();
    });
    el.audio.addEventListener("ended", () => {
      state.isPlaying = false;
      setPlayingUI(false);
      el.fpStatus.textContent = "Stream ended";
      maybePlayNextFromQueue();
    });

    document.addEventListener("keydown", (event) => {
      if (isTypingTarget(event.target)) return;

      if (event.key === "Escape") {
        closeTopSheet();
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        togglePlayPause();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        el.audio.volume = Math.min(1, el.audio.volume + 0.05);
        el.fpVolume.value = String(el.audio.volume);
        writeStorage(STORAGE.volume, el.audio.volume);
        updateMuteUI();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        el.audio.volume = Math.max(0, el.audio.volume - 0.05);
        el.fpVolume.value = String(el.audio.volume);
        writeStorage(STORAGE.volume, el.audio.volume);
        updateMuteUI();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        playRelative(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        playRelative(1);
      }
    });

    if (state.systemThemeMq) {
      const onThemeChange = () => {
        if (el.themeSelect.value === "system") applyTheme("system");
      };
      if (state.systemThemeMq.addEventListener) {
        state.systemThemeMq.addEventListener("change", onThemeChange);
      } else if (state.systemThemeMq.addListener) {
        state.systemThemeMq.addListener(onThemeChange);
      }
    }
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch((err) => {
        console.warn("SW registration failed:", err);
      });
    });
  }

  async function init() {
    loadPersistedState();
    bindEvents();
    registerServiceWorker();
    renderStatus();
    await fetchStations();
  }

  init().catch((err) => {
    console.error(err);
    state.loading = false;
    state.error = "Unable to load radio stations.";
    renderStatus();
  });
})();
