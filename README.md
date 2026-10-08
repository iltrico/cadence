# Cadence

A rowing machine coach in your browser. Pick a session and a length; the plan reshapes itself, then guides your stroke rate with a visual cue and a 9-second countdown before every interval change. Works offline once installed.

## Publish on GitHub Pages

1. Create a new public repository, for example `cadence`.
2. Upload every file in this folder to the repository root, keeping the `icons` folder.
3. Go to Settings, then Pages. Under "Build and deployment", pick "Deploy from a branch", branch `main`, folder `/ (root)`. Save.
4. After a minute the app is live at `https://<your-username>.github.io/cadence/`.

## Install on your phone

- iPhone: open the link in Safari, tap Share, then "Add to Home Screen".
- Android: open the link in Chrome, tap the menu, then "Install app".

## Updating

Change `VERSION` in `sw.js` (for example `cadence-v2`) every time you push changes, so installed copies fetch the new files.

## Files

- `plan.js`: session types and the plan algorithm. Edit rates, names and rep lengths here.
- `app.js`: setup screen, workout engine, stroke cue, countdown.
- `styles.css`: colors and type. Interval colors live in `KIND` inside `plan.js`.
