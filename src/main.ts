import './styles.css';
import { startFrontCamera, stopCamera } from './camera';
import { PoseTracker } from './pose';
import { mapPointToCoverVideo, PointSmoother, type ScreenPoint } from './videoGeometry';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App root not found');
}

app.innerHTML = `
  <main class="game-shell">
    <video id="camera" class="camera" aria-hidden="true"></video>
    <canvas id="game-canvas" class="game-canvas"></canvas>
    <div class="camera-shade" aria-hidden="true"></div>

    <header class="hud">
      <div class="brand">Pushup Bird</div>
      <div class="tracker-status" id="tracker-status">
        <span class="tracker-dot"></span>
        <span id="tracker-label">Camera off</span>
      </div>
    </header>

    <section class="overlay" id="intro-overlay">
      <div class="intro-card">
        <div class="bird-mark" aria-hidden="true">↗</div>
        <p class="eyebrow">Body-controlled browser game</p>
        <h1>Pushup<br />Bird</h1>
        <p class="lede">Your nose controls the bird. Get low, push up, dodge the pipes.</p>
        <button class="primary-button" id="start-button" type="button">Enable camera</button>
        <p class="privacy-note">Video is processed on-device and is never uploaded by this app.</p>
      </div>
    </section>

    <section class="overlay overlay--quiet is-hidden" id="ready-overlay" aria-live="polite">
      <div class="ready-pill">
        <strong id="ready-title">Find your face</strong>
        <span id="ready-copy">Place the phone where your head stays in frame.</span>
      </div>
    </section>
  </main>
`;

const camera = getElement<HTMLVideoElement>('camera');
const canvas = getElement<HTMLCanvasElement>('game-canvas');
const introOverlay = getElement<HTMLElement>('intro-overlay');
const readyOverlay = getElement<HTMLElement>('ready-overlay');
const startButton = getElement<HTMLButtonElement>('start-button');
const trackerStatus = getElement<HTMLElement>('tracker-status');
const trackerLabel = getElement<HTMLElement>('tracker-label');
const readyTitle = getElement<HTMLElement>('ready-title');
const readyCopy = getElement<HTMLElement>('ready-copy');
const context = canvas.getContext('2d');

if (!context) {
  throw new Error('Canvas is not supported in this browser.');
}

const tracker = new PoseTracker();
const smoother = new PointSmoother();
let stream: MediaStream | null = null;
let animationFrame = 0;
let latestPoint: ScreenPoint | null = null;
let lastDetectionAt = 0;
let lastInferenceAt = 0;
let started = false;

startButton.addEventListener('click', () => {
  void startExperience();
});

window.addEventListener('resize', resizeCanvas);
window.addEventListener('pagehide', cleanup);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    latestPoint = null;
    smoother.reset();
  }
});

resizeCanvas();

async function startExperience(): Promise<void> {
  if (started) {
    return;
  }

  started = true;
  startButton.disabled = true;
  startButton.textContent = 'Starting…';
  setTrackerState('loading', 'Loading tracker');

  try {
    const [cameraStream] = await Promise.all([
      startFrontCamera(camera),
      tracker.init(),
    ]);

    stream = cameraStream;
    introOverlay.classList.add('is-hidden');
    readyOverlay.classList.remove('is-hidden');
    setTrackerState('searching', 'Looking for you');
    animationFrame = requestAnimationFrame(loop);
  } catch (error) {
    started = false;
    startButton.disabled = false;
    startButton.textContent = 'Try again';
    setTrackerState('error', 'Camera unavailable');
    readyCopy.textContent = error instanceof Error ? error.message : 'Unable to start the camera.';
    introOverlay.classList.remove('is-hidden');
  }
}

function loop(now: number): void {
  animationFrame = requestAnimationFrame(loop);
  resizeCanvas();

  if (now - lastInferenceAt >= 42) {
    lastInferenceAt = now;
    const nose = tracker.detectNose(camera, now);

    if (nose && nose.visibility >= 0.45) {
      latestPoint = smoother.update(
        mapPointToCoverVideo(nose, camera, canvas.clientWidth, canvas.clientHeight),
      );
      lastDetectionAt = now;
      setTrackerState('tracking', 'Tracking');
      readyTitle.textContent = 'Tracking locked';
      readyCopy.textContent = 'Move up and down — the marker follows your nose.';
    }
  }

  if (now - lastDetectionAt > 650) {
    latestPoint = null;
    setTrackerState('searching', 'Looking for you');
    readyTitle.textContent = 'Find your face';
    readyCopy.textContent = 'Place the phone where your head stays in frame.';
  }

  drawTrackerPreview();
}

function drawTrackerPreview(): void {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  context.clearRect(0, 0, width, height);

  if (!latestPoint) {
    return;
  }

  context.save();
  context.beginPath();
  context.arc(latestPoint.x, latestPoint.y, 18, 0, Math.PI * 2);
  context.fillStyle = 'rgba(255, 210, 74, 0.95)';
  context.shadowColor = 'rgba(255, 210, 74, 0.6)';
  context.shadowBlur = 24;
  context.fill();
  context.restore();
}

function resizeCanvas(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(canvas.clientWidth));
  const height = Math.max(1, Math.round(canvas.clientHeight));
  const targetWidth = Math.round(width * dpr);
  const targetHeight = Math.round(height * dpr);

  if (canvas.width === targetWidth && canvas.height === targetHeight) {
    return;
  }

  canvas.width = targetWidth;
  canvas.height = targetHeight;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function setTrackerState(state: 'loading' | 'searching' | 'tracking' | 'error', label: string): void {
  trackerStatus.dataset.state = state;
  trackerLabel.textContent = label;
}

function cleanup(): void {
  cancelAnimationFrame(animationFrame);
  tracker.close();
  stopCamera(stream);
  stream = null;
}

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`Missing #${id}`);
  }

  return element as T;
}
