# Internet Radio

A modern, mobile-first Internet Radio web app built with **HTML**, **CSS**, and **vanilla JavaScript**. Stations load dynamically from a GitHub-hosted JSON playlist. The app is installable as a Progressive Web App (PWA).

## Features

- Dynamic station loading from a remote JSON playlist
- Mobile-first UI with bottom navigation and sticky mini-player
- Full player with play/pause, previous/next, volume, mute, and CSS visualizer
- Instant search by name, country, genre, and description
- Category chips (All, Favorites, Recently Played, genre/language filters)
- Favorites with localStorage persistence
- Drag-and-drop favorite reordering (Edit Favorites mode)
- Recently played history (max 20, newest first)
- Simple queue with add/remove/clear
- Share station (Web Share API + clipboard fallback)
- Sleep timer (15–90 minutes)
- Dark / Light / System themes
- Keyboard shortcuts for desktop
- Accessible controls, focus states, and semantic markup
- PWA install support with offline app-shell caching (audio streams are never cached)

## Playlist

Stations are fetched at runtime from:

```text
https://raw.githubusercontent.com/simsonpeter/Tcradios/refs/heads/main/stations.json
```

They are **not** hard-coded into the HTML/JavaScript.

### How the playlist works

1. The app fetches `stations.json` when it starts (and when you tap Refresh).
2. JSON is parsed and validated.
3. Fields are normalized into a consistent shape (`id`, `name`, `streamUrl`, `logo`, `country`, `genre`, `description`, `website`).
4. Missing fields use safe defaults; stable IDs are generated when needed.
5. The UI renders station cards dynamically.
6. Favorites, recently played, and custom favorite order are preserved across playlist refreshes.

### Current playlist fields

The live playlist currently provides:

- `name`
- `url` (stream URL)
- `logo`
- `genre`
- `metadata`

The normalization layer also accepts alternate names such as `title`, `streamUrl`, `image`, `country`, and `description` if the playlist expands later.

## Local storage

| Key | Purpose |
| --- | --- |
| `ir_favorites_v1` | Favorite station IDs |
| `ir_favorite_order_v1` | Custom favorite order |
| `ir_recent_v1` | Recently played IDs (max 20) |
| `ir_queue_v1` | Queue station IDs |
| `ir_theme_v1` | Theme preference (`dark`, `light`, `system`) |
| `ir_volume_v1` / `ir_muted_v1` | Volume and mute state |

## File structure

```text
/
├── index.html
├── style.css
├── app.js
├── manifest.json
├── service-worker.js
├── README.md
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

## How to run locally

Because the app fetches a remote playlist and registers a service worker, use a local static server (opening `index.html` as a `file://` URL may block features).

```bash
# Python
python3 -m http.server 8080

# Node (if available)
npx serve .
```

Then open `http://localhost:8080`.

## Deploy with GitHub Pages

1. Push this project to the repository `main` branch (already the intended setup).
2. In GitHub: **Settings → Pages**.
3. Set source to **Deploy from a branch**.
4. Choose branch `main` and folder `/ (root)`.
5. Save, then open the Pages URL (for example `https://<user>.github.io/<repo>/`).

No build step is required.

## Install as a PWA

1. Open the site in a supported browser (Chrome, Edge, Safari, Firefox Android, etc.).
2. Use **Install app** / **Add to Home Screen**.
3. Launch from the home screen for a standalone experience.

The service worker caches the offline shell (`index.html`, CSS, JS, icons, manifest). The station playlist is still fetched from GitHub when online. Radio audio streams are never cached or proxied.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Space` | Play / Pause |
| `Arrow Up` | Volume up |
| `Arrow Down` | Volume down |
| `Arrow Left` | Previous station |
| `Arrow Right` | Next station |
| `Escape` | Close modal / menu |

Shortcuts are ignored while typing in search or other inputs.

## Browser compatibility

- Modern Chromium browsers (Chrome, Edge, Brave)
- Firefox
- Safari (iOS/macOS) — install via Add to Home Screen
- Android Chrome / Samsung Internet

Playback depends on the browser supporting the station’s stream format (MP3, AAC, OGG, and other native HTML5 audio formats). Some stations may block hotlinking or use formats/codecs a given browser cannot play.

## Known limitations

- Stations are live HTTP(S) streams; availability depends on each broadcaster.
- Some streams may fail due to CORS, geo-restrictions, expired tokens, or unsupported codecs.
- Country / description / website fields may be empty when the playlist does not provide them.
- Offline mode serves the app shell only; browsing an updated playlist and playing streams requires network access.
- Autoplay policies may require a user gesture before audio starts.

## License

Use and modify as needed for your project.
