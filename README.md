# NotebookLM Organizer

Chrome extension that organizes your [NotebookLM](https://notebooklm.google.com) notebooks using **hierarchical hashtags** in their names, displayed as a folder tree in the browser side panel.

NotebookLM does not offer folders or categories. This extension solves that by scanning notebook names for `#hashtags` and building a virtual folder structure — no external storage, no account linking.

---

## How it works

Add hashtags to your notebook names directly in NotebookLM:

| Notebook name | Folder in extension |
|---|---|
| `AI Paper #research/nlp` | `research > nlp` |
| `Client meeting #work #2025` | `work` and `2025` |
| `Random ideas` | `Unlabeled` |
| `Thesis #uni/grad/chapter1` | `uni > grad > chapter1` |

The extension scans names automatically and groups them into virtual folders.

---

## Features

### Core
- **Hierarchical hashtags** — `#parent/child/grandchild` creates nested folders
- **Multi-tag** — a notebook with `#work #2025` appears in both folders
- **Side Panel UI** — always visible while you browse NotebookLM
- **Auto-sync** — `MutationObserver` detects changes in real time (SPA-aware)
- **Dark/Light mode** — follows system preference automatically

### Organization
- **Favorites** — star any notebook; favorites section always at the top
- **Recents** — last 10 opened notebooks with relative timestamps
- **Search** — filter notebooks and hashtags instantly
- **Expand/Collapse all** — quick tree navigation

### Navigation
- **Click to open** — click any notebook in the tree to navigate directly
- **Active indicator** — highlights the notebook you're currently viewing
- **Smart navigation** — handles transitions between notebook list and individual notebooks

### Data
- **Badge** — shows total notebook count on the extension icon
- **Export JSON** — download your full organization structure as a dated JSON file
- **Persistent state** — survives browser restarts and service worker sleep cycles

---

## Installation

### Load as unpacked extension (developer mode)

1. Clone or download this repository
2. Open Chrome → `chrome://extensions/`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked**
5. Select the `notebooklm-organizer/` folder
6. Navigate to `https://notebooklm.google.com`
7. Click the extension icon to open the side panel

No build step required. No npm. No dependencies.

---

## Hashtag convention

```
Notebook name #tag1 #tag2/subtag #parent/child/grandchild
```

| Pattern | Result |
|---|---|
| `#work` | Folder `work` |
| `#work/projects` | `work > projects` |
| `#work #2025` | Appears in both `work` and `2025` |
| _(no hashtag)_ | Goes to `Unlabeled` |

### Supported characters
Letters (including accented: `a`, `n`, `u`), numbers, hyphens (`-`), and `/` for hierarchy.

---

## Project structure

```
notebooklm-organizer/
├── manifest.json                # Chrome MV3 configuration
├── background/
│   └── service-worker.js        # State management, messaging broker, badge
├── content/
│   ├── content-script.js        # Orchestrator, SPA navigation detection
│   ├── scraper.js               # DOM scraping with fallback selectors
│   └── observer.js              # MutationObserver with debounce
├── shared/
│   ├── constants.js             # CSS selectors, configuration
│   ├── messages.js              # Message protocol between contexts
│   ├── parser.js                # Hashtag parser (pure function)
│   └── tree-builder.js          # Folder tree construction
├── sidepanel/
│   ├── sidepanel.html           # Side panel UI
│   ├── sidepanel.css            # Styles (light + dark mode)
│   └── sidepanel.js             # Panel logic, rendering, export
└── icons/
    ├── icon-16.png              # Toolbar icon
    ├── icon-48.png              # Extension management
    └── icon-128.png             # Chrome Web Store
```

---

## Technical notes

- **No build step** — vanilla JS, no bundler, no framework, no npm in production
- **Manifest V3** — uses the current Chrome extension standard
- **DOM resilience** — layered CSS selectors with fallbacks; if Google changes class names, pattern-based detection still works
- **SPA-aware** — `MutationObserver` + 400ms debounce detects Angular route changes without page reload
- **Persistent state** — `chrome.storage.local` survives service worker termination; in-memory state rebuilt on wake
- **URL caching** — learns real notebook URLs on first visit for direct navigation on subsequent clicks
- **Minimal permissions** — only `sidePanel`, `tabs`, `storage`, and host access to `notebooklm.google.com`

---

## Troubleshooting

| Problem | Solution |
|---|---|
| No notebooks detected | Make sure you're on `https://notebooklm.google.com` (main list, not inside a notebook). Click the refresh button in the panel. |
| Extension stopped syncing | Reload the extension at `chrome://extensions/`. The service worker may have been terminated by Chrome. |
| DOM changed after a Google update | Update selectors in `shared/constants.js` under `SELECTORS.NOTEBOOK_CARD` and `SELECTORS.NOTEBOOK_TITLE`. |

---

## Permissions

| Permission | Why |
|---|---|
| `sidePanel` | Display the folder tree panel |
| `tabs` | Navigate to notebooks on click |
| `storage` | Persist state between sessions |
| `host: notebooklm.google.com` | Inject content script to read notebook names |

---

## License

MIT
