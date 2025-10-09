# Flappy — Netlify Ready

A lightweight Flappy Bird–style game you can deploy to Netlify. Includes two bird images:
- `assets/bird_idle.png` (gliding)
- `assets/bird_flap.png` (wing up)

When you press **Space / tap**, the game applies an upward impulse and momentarily swaps to `bird_flap.png`, then returns to idle automatically.

## How to run locally

Just open `index.html` in a browser, or use any static server:

```bash
# python3
python -m http.server 8080
# or
npx http-server .
```

## Deploy to Netlify

1. Zip this folder or push it to a Git repo.
2. On Netlify:
   - New site → **Deploy manually** (drag & drop the folder) **or**
   - New site from Git (build command: _empty_, publish directory: `.`).
3. Done!

`netlify.toml` is included and sets the publish directory to the project root.

## Replace the bird art

Put your own 2 PNGs in `/assets` with the same filenames:
- `bird_idle.png`
- `bird_flap.png`

Recommended size: ~64×48, transparent backgrounds. The canvas draws them at ~48×36.

## Controls
- **Space / ArrowUp / Tap**: Flap
- **Enter**: Start (from title)
- **↻ Restart**: Restart any time

## Features
- Smooth physics, rotation based on velocity
- Randomized pipe positions
- Score + local best (stored with `localStorage`)
- Touch-friendly (pointer events)
- Crisp on HiDPI screens

## File structure
```
.
├── assets/
│   ├── bird_idle.png
│   └── bird_flap.png
├── index.html
├── main.js
├── style.css
└── netlify.toml
```
