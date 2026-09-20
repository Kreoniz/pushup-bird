import type { ScreenPoint } from './videoGeometry';

interface PipePair {
  x: number;
  gapCenter: number;
  gapSize: number;
  scored: boolean;
}

export interface GameFrame {
  score: number;
  gameOver: boolean;
}

export class PushupBirdGame {
  private readonly birdSpritesImage = new Image();
  private readonly pipeImage = new Image();
  private pipes: PipePair[] = [];
  private score = 0;
  private running = false;
  private gameOver = false;
  private width = 0;
  private height = 0;
  private lastBird: ScreenPoint = { x: 0, y: 0 };
  private lastGapZone = -1;

  constructor() {
    this.birdSpritesImage.src = new URL('assets/bird-sprites.webp', document.baseURI).href;
    this.pipeImage.src = new URL('assets/pipe.webp', document.baseURI).href;
  }

  reset(width: number, height: number, player: ScreenPoint): void {
    this.width = width;
    this.height = height;
    this.score = 0;
    this.running = false;
    this.gameOver = false;
    this.pipes = [];
    this.lastGapZone = -1;
    this.lastBird = this.getBirdPoint(player);
  }

  start(): void {
    this.running = true;
    this.gameOver = false;
    this.spawnPipe(this.width * 0.78, this.lastBird.y);
    this.spawnPipe(this.width * 1.42);
  }

  update(deltaSeconds: number, player: ScreenPoint, tracking: boolean): GameFrame {
    this.lastBird = this.getBirdPoint(player);

    if (!this.running || this.gameOver || !tracking) {
      return { score: this.score, gameOver: this.gameOver };
    }

    const speed = this.getPipeSpeed();
    const delta = Math.min(deltaSeconds, 0.05);

    for (const pipe of this.pipes) {
      pipe.x -= speed * delta;

      if (!pipe.scored && pipe.x + this.getPipeWidth() < this.lastBird.x) {
        pipe.scored = true;
        this.score += 1;
      }
    }

    this.pipes = this.pipes.filter((pipe) => pipe.x + this.getPipeWidth() > -20);

    const lastPipe = this.pipes.at(-1);
    if (!lastPipe || lastPipe.x < this.width - this.getSpawnDistance()) {
      this.spawnPipe();
    }

    if (this.collides(this.lastBird)) {
      this.running = false;
      this.gameOver = true;
    }

    return { score: this.score, gameOver: this.gameOver };
  }

  draw(context: CanvasRenderingContext2D, player: ScreenPoint | null): void {
    if (this.width <= 0 || this.height <= 0) {
      return;
    }

    for (const pipe of this.pipes) {
      this.drawPipe(context, pipe);
    }

    if (player) {
      this.drawBird(context, this.getBirdPoint(player));
    }
  }

  resize(width: number, height: number): void {
    if (this.width === 0 || this.height === 0) {
      this.width = width;
      this.height = height;
      return;
    }

    const scaleX = width / this.width;
    const scaleY = height / this.height;

    for (const pipe of this.pipes) {
      pipe.x *= scaleX;
      pipe.gapCenter *= scaleY;
      pipe.gapSize *= scaleY;
    }

    this.width = width;
    this.height = height;
  }

  private spawnPipe(
    x = this.width + this.getPipeWidth(),
    preferredCenter?: number,
  ): void {
    const gapSize = this.getGapSize();
    const safeMargin = Math.max(72, this.height * 0.09);
    const minCenter = safeMargin + gapSize / 2;
    const maxCenter = this.height - safeMargin - gapSize / 2;
    const playableRange = Math.max(1, maxCenter - minCenter);
    const zoneCount = 4;

    let gapCenter: number;

    if (preferredCenter !== undefined) {
      gapCenter = clamp(preferredCenter, minCenter, maxCenter);
      this.lastGapZone = clamp(
        Math.floor(((gapCenter - minCenter) / playableRange) * zoneCount),
        0,
        zoneCount - 1,
      );
    } else {
      let zone = Math.floor(Math.random() * zoneCount);

      if (zone === this.lastGapZone) {
        zone = (zone + 1 + Math.floor(Math.random() * (zoneCount - 1))) % zoneCount;
      }

      const zoneStart = minCenter + (playableRange * zone) / zoneCount;
      const zoneEnd = minCenter + (playableRange * (zone + 1)) / zoneCount;
      gapCenter = randomBetween(zoneStart, zoneEnd);
      this.lastGapZone = zone;
    }

    this.pipes.push({
      x,
      gapCenter,
      gapSize,
      scored: false,
    });
  }

  private getBirdPoint(player: ScreenPoint): ScreenPoint {
    const offset = clamp(this.width * 0.09, 42, 82);
    const radius = this.getBirdRadius();

    return {
      x: clamp(player.x - offset, radius + 8, this.width - radius - 8),
      y: clamp(player.y, radius + 8, this.height - radius - 8),
    };
  }

  private getBirdRadius(): number {
    return clamp(Math.min(this.width, this.height) * 0.035, 18, 28);
  }

  private getPipeWidth(): number {
    return clamp(this.width * 0.18, 70, 112);
  }

  private getGapSize(): number {
    const base = clamp(this.height * 0.25, 160, 260);
    const difficulty = Math.min(this.score * 3, base * 0.18);
    return base - difficulty;
  }

  private getPipeSpeed(): number {
    const base = clamp(this.width * 0.38, 155, 245);
    return base * (1 + Math.min(this.score, 24) * 0.012);
  }

  private getSpawnDistance(): number {
    return clamp(this.width * 0.62, 310, 570);
  }

  private collides(bird: ScreenPoint): boolean {
    const radius = this.getBirdRadius() * 0.74;
    const pipeWidth = this.getPipeWidth();

    return this.pipes.some((pipe) => {
      const gapTop = pipe.gapCenter - pipe.gapSize / 2;
      const gapBottom = pipe.gapCenter + pipe.gapSize / 2;

      return (
        circleRectCollision(bird.x, bird.y, radius, pipe.x, 0, pipeWidth, gapTop) ||
        circleRectCollision(
          bird.x,
          bird.y,
          radius,
          pipe.x,
          gapBottom,
          pipeWidth,
          this.height - gapBottom,
        )
      );
    });
  }

  private drawPipe(context: CanvasRenderingContext2D, pipe: PipePair): void {
    const width = this.getPipeWidth();
    const gapTop = pipe.gapCenter - pipe.gapSize / 2;
    const gapBottom = pipe.gapCenter + pipe.gapSize / 2;

    if (this.pipeImage.complete && this.pipeImage.naturalWidth > 0) {
      this.drawSlicedPipe(context, pipe.x, width, gapTop, gapBottom);
      return;
    }

    this.drawFallbackPipe(context, pipe, gapTop, gapBottom, width);
  }

  private drawSlicedPipe(
    context: CanvasRenderingContext2D,
    x: number,
    width: number,
    gapTop: number,
    gapBottom: number,
  ): void {
    const shaftWidth = width * 0.87;
    const shaftX = x + (width - shaftWidth) / 2;
    const capHeight = width * 0.4;
    const topShaftHeight = Math.max(0, gapTop - capHeight);
    const bottomShaftY = gapBottom + capHeight;
    const bottomShaftHeight = Math.max(0, this.height - bottomShaftY);

    context.save();
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.shadowColor = 'rgba(0, 0, 0, 0.22)';
    context.shadowBlur = 10;

    if (topShaftHeight > 0) {
      context.drawImage(
        this.pipeImage,
        159,
        0,
        194,
        214,
        shaftX,
        0,
        shaftWidth,
        topShaftHeight,
      );
    }

    context.drawImage(
      this.pipeImage,
      145,
      215,
      222,
      89,
      x,
      gapTop - capHeight,
      width,
      capHeight,
    );

    context.drawImage(
      this.pipeImage,
      145,
      448,
      222,
      97,
      x,
      gapBottom,
      width,
      capHeight,
    );

    if (bottomShaftHeight > 0) {
      context.drawImage(
        this.pipeImage,
        159,
        545,
        194,
        223,
        shaftX,
        bottomShaftY,
        shaftWidth,
        bottomShaftHeight,
      );
    }

    context.restore();
  }

  private drawFallbackPipe(
    context: CanvasRenderingContext2D,
    pipe: PipePair,
    gapTop: number,
    gapBottom: number,
    width: number,
  ): void {
    const capHeight = clamp(width * 0.24, 16, 28);
    const capOverhang = clamp(width * 0.08, 6, 10);
    const gradient = context.createLinearGradient(pipe.x, 0, pipe.x + width, 0);
    gradient.addColorStop(0, '#2fc5aa');
    gradient.addColorStop(0.52, '#70efd0');
    gradient.addColorStop(1, '#1b9a86');

    context.save();
    context.fillStyle = gradient;
    context.strokeStyle = 'rgba(4, 33, 31, 0.72)';
    context.lineWidth = 2;
    context.shadowColor = 'rgba(0, 0, 0, 0.22)';
    context.shadowBlur = 12;

    roundedRect(context, pipe.x, -10, width, Math.max(0, gapTop - capHeight + 10), 8);
    context.fill();
    context.stroke();
    roundedRect(
      context,
      pipe.x - capOverhang,
      gapTop - capHeight,
      width + capOverhang * 2,
      capHeight,
      7,
    );
    context.fill();
    context.stroke();

    roundedRect(
      context,
      pipe.x,
      gapBottom + capHeight,
      width,
      Math.max(0, this.height - gapBottom - capHeight + 10),
      8,
    );
    context.fill();
    context.stroke();
    roundedRect(
      context,
      pipe.x - capOverhang,
      gapBottom,
      width + capOverhang * 2,
      capHeight,
      7,
    );
    context.fill();
    context.stroke();
    context.restore();
  }

  private drawBird(context: CanvasRenderingContext2D, bird: ScreenPoint): void {
    const radius = this.getBirdRadius();
    const spriteSize = radius * 3.8;

    context.save();
    context.translate(bird.x, bird.y);
    context.rotate(-0.08);
    context.shadowColor = 'rgba(0, 0, 0, 0.24)';
    context.shadowBlur = 12;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';

    if (this.birdSpritesImage.complete && this.birdSpritesImage.naturalWidth > 0) {
      const frame = Math.floor(performance.now() / 120) % 3;
      const sourceSize = this.birdSpritesImage.naturalHeight;

      context.drawImage(
        this.birdSpritesImage,
        frame * sourceSize,
        0,
        sourceSize,
        sourceSize,
        -spriteSize * 0.5,
        -spriteSize * 0.5,
        spriteSize,
        spriteSize,
      );
    } else {
      context.fillStyle = '#ffd248';
      context.beginPath();
      context.arc(0, 0, radius, 0, Math.PI * 2);
      context.fill();
    }

    context.restore();
  }
}

function circleRectCollision(
  circleX: number,
  circleY: number,
  radius: number,
  rectX: number,
  rectY: number,
  rectWidth: number,
  rectHeight: number,
): boolean {
  if (rectHeight <= 0) {
    return false;
  }

  const closestX = clamp(circleX, rectX, rectX + rectWidth);
  const closestY = clamp(circleY, rectY, rectY + rectHeight);
  const deltaX = circleX - closestX;
  const deltaY = circleY - closestY;

  return deltaX * deltaX + deltaY * deltaY < radius * radius;
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
