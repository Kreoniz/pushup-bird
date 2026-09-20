import type { TrackedPoint } from './pose';

export interface ScreenPoint {
  x: number;
  y: number;
}

export function mapPointToCoverVideo(
  point: TrackedPoint,
  video: HTMLVideoElement,
  viewportWidth: number,
  viewportHeight: number,
  mirrored = true,
): ScreenPoint {
  const sourceWidth = video.videoWidth || viewportWidth;
  const sourceHeight = video.videoHeight || viewportHeight;
  const scale = Math.max(viewportWidth / sourceWidth, viewportHeight / sourceHeight);
  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;
  const offsetX = (viewportWidth - renderedWidth) / 2;
  const offsetY = (viewportHeight - renderedHeight) / 2;
  const normalizedX = mirrored ? 1 - point.x : point.x;

  return {
    x: normalizedX * sourceWidth * scale + offsetX,
    y: point.y * sourceHeight * scale + offsetY,
  };
}

export class PointSmoother {
  private value: ScreenPoint | null = null;

  update(next: ScreenPoint, amount = 0.28): ScreenPoint {
    if (!this.value) {
      this.value = next;
      return next;
    }

    this.value = {
      x: this.value.x + (next.x - this.value.x) * amount,
      y: this.value.y + (next.y - this.value.y) * amount,
    };

    return this.value;
  }

  reset(): void {
    this.value = null;
  }
}
