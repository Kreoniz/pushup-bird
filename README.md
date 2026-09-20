# Pushup Bird

A camera-controlled browser game: your nose drives the bird while you move through push-ups and try to clear the pipes.

The project is intentionally client-only. There is no application server, account system, analytics backend, or camera upload endpoint.

## How it works

1. The browser asks for the front camera after a user gesture.
2. MediaPipe Pose Landmarker detects the nose locally in the browser.
3. The landmark is mapped onto the mirrored, `object-fit: cover` camera preview and smoothed.
4. A Canvas game loop places the bird beside the tracked nose and scrolls obstacles across the screen.
5. Scores and the local best score live only in browser state / `localStorage`.

## Stack

- Vite + TypeScript
- MediaPipe Tasks Vision / Pose Landmarker
- Canvas 2D
- GitHub Actions + GitHub Pages

## Local development

```bash
npm install
npm run dev
```

Production verification:

```bash
npm run build
npm run preview
```

Camera access requires a secure context. `localhost` works for development; the production site uses GitHub Pages HTTPS.

## Privacy

Camera frames are processed on-device and are not uploaded by this application. The app does not contain API keys, secrets, user identifiers, or a backend.

The MediaPipe runtime and pose model are downloaded from public Google/jsDelivr endpoints. MediaPipe documents that input data stays on-device, while runtime performance/utilization metrics may be sent under its own privacy terms.

## Deployment

`.github/workflows/pages.yml` builds `main` and publishes `dist/` to GitHub Pages. Vite's base path is configured for `/pushup-bird/`.

Expected URL after Pages is enabled and the deployment succeeds:

`https://kreoniz.github.io/pushup-bird/`

## Controls

- Keep your face visible to the front camera.
- The bird follows your nose with a small horizontal offset so your face stays visible.
- Move vertically to steer through pipe gaps.
- Losing tracking pauses movement instead of immediately ending the run.
