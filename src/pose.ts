import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export interface TrackedPoint {
  x: number;
  y: number;
  visibility: number;
}

export class PoseTracker {
  private landmarker: PoseLandmarker | null = null;
  private lastVideoTime = -1;

  async init(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);

    try {
      this.landmarker = await this.createLandmarker(vision, 'GPU');
    } catch {
      this.landmarker = await this.createLandmarker(vision, 'CPU');
    }
  }

  detectNose(video: HTMLVideoElement, timestampMs: number): TrackedPoint | null {
    if (!this.landmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return null;
    }

    if (video.currentTime === this.lastVideoTime) {
      return null;
    }

    this.lastVideoTime = video.currentTime;
    const result = this.landmarker.detectForVideo(video, timestampMs);
    const nose = result.landmarks[0]?.[0];

    if (!nose) {
      return null;
    }

    return {
      x: nose.x,
      y: nose.y,
      visibility: nose.visibility ?? 1,
    };
  }

  close(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }

  private createLandmarker(
    vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
    delegate: 'GPU' | 'CPU',
  ): Promise<PoseLandmarker> {
    return PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate,
      },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  }
}
