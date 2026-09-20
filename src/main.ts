import './styles.css';
import { startFrontCamera, stopCamera } from './camera';
import { PushupBirdGame } from './game';
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
      <div class="score is-hidden" id="score" aria-label="Score">0</div>
      <div class="tracker-status" id="tracker-status">
        <span class="tracker-dot"></span>
        <span id="tracker-label">Camera off</span>
      </div>
    </header>

    <section class="overlay" id="intro-overlay">
      <div class="intro-card">
        <img
          class="app-icon"
          src="\${import.meta.env.BASE_URL}assets/icon.webp"
          alt=""
          aria-hidden="true"
        />
        <p class="eyebrow">Body-controlled browser game</p>
        <img
          class="game-logo"
          src="\${import.meta.env.BASE_URL}assets/logo.webp"
          alt="Pushup Bird"
        />
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

    <section class="countdown is-hidden" id="countdown" aria-live="assertive">3</section>

    <section class="overlay game-over-overlay is-hidden" id="game-over-overlay">
      <div class="game-over-card">
        <p class="eyebrow">Run over</p>
        <h2 id="game-over-score">0</h2>
        <p class="score-label">pipes cleared</p>
        <p class="best-score" id="best-score">Best: 0</p>
        <button class="primary-button" id="retry-button" type="button">Go again</button>
      </div>
    </section>
  </main>
`;

const camera = getElement<HTMLVideoElement>('camera');
const canvas = getElement<HTMLCanvasElement>('game-canvas');
const introOverlay = getElement<HTMLElement>('intro-overlay');
const readyOverlay = getElement<HTMLElement>('ready-overlay');
const countdown = getElement<HTMLElement>('countdown');
const gameOverOverlay = getElement<HTMLElement>('game-over-overlay');
const startButton = getElement<HTMLButtonElement>('start-button');
const retryButton = getElement<HTMLButtonElement>('retry-button');
const trackerStatus = getElement<HTMLElement>('tracker-status');
const trackerLabel = getElement<HTMLElement>('tracker-label');
const readyTitle = getElement<HTMLElement>('ready-title');
const readyCopy = getElement<HTMLElement>('ready-copy');
const scoreElement = getElement<HTMLElement>('score');
const gameOverScore = getElement<HTMLElement>('game-over-score');
const bestScore = getElement<HTMLElement>('best-score');
const context = getCanvasContext(canvas);

const tracker = new PoseTracker();
const smoother = new PointSmoother();
const game = new PushupBirdGame();
let stream: MediaStream | null = null;
let animationFrame = 0;
let latestPoint: ScreenPoint | null = null;
let lastDetectionAt = 0;
let lastInferenceAt = 0;
let lastFrameAt = performance.now();
let stableTrackingSince = 0;
let countdownStartedAt = 0;
let started = false;
let phase: 'setup' | 'ready' | 'countdown' | 'playing' | 'gameover' = 'setup';
let displayedScore = 0;

startButton.addEventListener('click', () => {
  void startExperience();
});

retryButton.addEventListener('click', () => {
  gameOverOverlay.classList.add('is-hidden');
  scoreElement.classList.remove('is-hidden');
  phase = 'ready';
  stableTrackingSince = 0;
  countdownStartedAt = 0;
  if (latestPoint) {
    game.reset(canvas.clientWidth, canvas.clientHeight, latestPoint);
  }
  readyOverlay.classList.remove('is-hidden');
  readyTitle.textContent = 'Hold position';
  readyCopy.textContent = 'Keep your face visible. We’ll start automatically.';
});

window.addEventListener('resize', resizeCanvas);
window.addEventListener('pagehide', cleanup);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    latestPoint = null;
    smoother.reset();
    stableTrackingSince = 0;
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
    scoreElement.classList.remove('is-hidden');
    setTrackerState('searching', 'Looking for you');
    phase = 'ready';
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
  const deltaSeconds = Math.min((now - lastFrameAt) / 1000, 0.05);
  lastFrameAt = now;

  if (now - lastInferenceAt >= 42) {
    lastInferenceAt = now;
    const nose = tracker.detectNose(camera, now);

    if (nose && nose.visibility >= 0.45) {
      latestPoint = smoother.update(
        mapPointToCoverVideo(nose, camera, canvas.clientWidth, canvas.clientHeight),
      );
      lastDetectionAt = now;
      setTrackerState('tracking', 'Tracking');
    }
  }

  const tracking = latestPoint !== null && now - lastDetectionAt <= 650;

  if (!tracking) {
    latestPoint = null;
    stableTrackingSince = 0;
    setTrackerState('searching', 'Looking for you');

    if (phase === 'ready' || phase === 'countdown') {
      phase = 'ready';
      countdown.classList.add('is-hidden');
      readyOverlay.classList.remove('is-hidden');
      readyTitle.textContent = 'Find your face';
      readyCopy.textContent = 'Place the phone where your head stays in frame.';
    }
  } else if (latestPoint) {
    updateGameState(now, latestPoint, tracking);
  }

  context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  game.draw(context, latestPoint);

  if (phase === 'playing' && latestPoint) {
    const frame = game.update(deltaSeconds, latestPoint, tracking);
    setScore(frame.score);

    if (frame.gameOver) {
      showGameOver(frame.score);
    }
  }
}

function updateGameState(now: number, point: ScreenPoint, tracking: boolean): void {
  if (!tracking || phase === 'playing' || phase === 'gameover') {
    return;
  }

  if (phase === 'ready') {
    if (stableTrackingSince === 0) {
      stableTrackingSince = now;
      game.reset(canvas.clientWidth, canvas.clientHeight, point);
      setScore(0);
    }

    const stableFor = now - stableTrackingSince;
    readyTitle.textContent = stableFor > 450 ? 'Nice — hold there' : 'Tracking locked';
    readyCopy.textContent = 'Keep your face visible. We’ll start automatically.';

    if (stableFor >= 900) {
      phase = 'countdown';
      countdownStartedAt = now;
      readyOverlay.classList.add('is-hidden');
      countdown.classList.remove('is-hidden');
    }
    return;
  }

  if (phase === 'countdown') {
    const elapsed = now - countdownStartedAt;
    const remaining = Math.max(1, 3 - Math.floor(elapsed / 700));
    countdown.textContent = String(remaining);

    if (elapsed >= 2100) {
      countdown.classList.add('is-hidden');
      phase = 'playing';
      game.reset(canvas.clientWidth, canvas.clientHeight, point);
      game.start();
    }
  }
}

function showGameOver(score: number): void {
  phase = 'gameover';
  const currentBest = getBestScore();
  const nextBest = Math.max(currentBest, score);

  if (nextBest !== currentBest) {
    localStorage.setItem('pushup-bird-best', String(nextBest));
  }

  gameOverScore.textContent = String(score);
  bestScore.textContent = `Best: ${nextBest}`;
  gameOverOverlay.classList.remove('is-hidden');
}

function setScore(score: number): void {
  if (displayedScore === score) {
    return;
  }

  displayedScore = score;
  scoreElement.textContent = String(score);
}

function getBestScore(): number {
  const parsed = Number.parseInt(localStorage.getItem('pushup-bird-best') ?? '0', 10);
  return Number.isFinite(parsed) ? parsed : 0;
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
  game.resize(width, height);
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

function getCanvasContext(canvasElement: HTMLCanvasElement): CanvasRenderingContext2D {
  const canvasContext = canvasElement.getContext('2d');

  if (!canvasContext) {
    throw new Error('Canvas is not supported in this browser.');
  }

  return canvasContext;
}
