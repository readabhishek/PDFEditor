# PDF Studio — Free PDF Editor

A fully featured, free PDF viewer and editor that runs **100% in your browser**. No uploads, no server, no subscriptions.

## ✨ Features

### Viewing
- Smooth PDF rendering with PDF.js
- Zoom in/out, fit page, fit width
- Page navigation (keyboard + UI)
- Page thumbnails in sidebar
- Document outline/bookmarks
- Document metadata/info panel

### Annotations & Editing
- **Text Tool** — add text overlays with custom font, size, color
- **Highlight Tool** — freehand highlight regions
- **Draw Tool** — freehand pencil drawing
- **Eraser Tool** — erase drawings
- **Sticky Notes** — add resizable, movable notes
- **Shapes** — rectangles and circles

### Page Operations
- Rotate pages (CW / CCW)
- Delete pages
- Extract specific pages to new PDF

### PDF Tools
- **Merge** — combine multiple PDFs (drag to reorder)
- **Split** — by page range, every N pages, or all pages
- **Compress** — reduce file size (3 levels)
- **Watermark** — custom text, color, opacity, angle, font size
- **Page Numbers** — 6 positions, 3 formats, custom font size
- **Search** — full-text search across all pages

### Privacy
- 🔒 **100% client-side** — files never leave your device
- No tracking, no ads, no account required
- Works offline after first load

## 🚀 Deploy to GitHub Pages

1. Fork or clone this repository
2. Push to your GitHub account
3. Go to **Settings → Pages**
4. Select **Deploy from branch: `main` / root (`/`)**
5. Your app will be live at `https://yourusername.github.io/pdf-studio/`

## 🛠 Tech Stack

| Library | Purpose | CDN |
|---------|---------|-----|
| [PDF.js](https://mozilla.github.io/pdf.js/) | PDF rendering | cdnjs |
| [pdf-lib](https://pdf-lib.js.org/) | PDF manipulation | cdnjs |
| Vanilla JS | App logic | — |

## 📁 Structure

```
pdf-studio/
├── index.html          # Main app
├── css/
│   ├── main.css        # Base styles, landing
│   ├── toolbar.css     # Toolbar & navigation
│   ├── sidebar.css     # Sidebar panels
│   ├── viewer.css      # PDF viewer & annotations
│   └── modals.css      # Modal dialogs
├── js/
│   ├── utils.js        # Shared utilities
│   ├── pdfEngine.js    # PDF.js wrapper
│   ├── annotations.js  # Text, drawing, highlights
│   ├── tools.js        # Merge, split, compress, etc.
│   ├── sidebar.js      # Thumbnails, outline, info
│   └── app.js          # Main orchestrator
└── README.md
```

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `→` / `↓` | Next page |
| `←` / `↑` | Previous page |
| `+` / `=` | Zoom in |
| `-` | Zoom out |
| `Ctrl+F` | Search |
| `Ctrl+S` | Save/Download |
| `Ctrl+P` | Print |
| `Esc` | Reset tool / close panels |

## License

MIT — free to use, modify, and deploy.
