import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { OneEuroFilter2D } from './oneEuroFilter';
import { GestureDetector } from './gestureDetector';
import type { Hand } from './roundFlow';
import { selectTrackedHand } from './handedness';
import type { Gesture, Landmark } from './gestureDetector';

export class HandTracker {
  private video: HTMLVideoElement;
  private overlayCanvas: HTMLCanvasElement;
  private overlayCtx: CanvasRenderingContext2D;
  private landmarker: HandLandmarker | null = null;
  private detector: GestureDetector;
  private filter: OneEuroFilter2D;
  
  private active = false;
  private lastHand: Hand = 'Unknown';
  private lastVideoTime = -1;
  
  // Callbacks
  public onLoaded: (() => void) | null = null;
  public onError: ((err: Error) => void) | null = null;
  public onUpdate: ((data: {
    rawX: number;
    rawY: number;
    filteredX: number;
    filteredY: number;
    gesture: Gesture;
    landmarks: Landmark[] | null;
    hand: Hand;
  }) => void) | null = null;
  public onFPS: ((fps: number) => void) | null = null;

  // Tracking FPS calculation
  private frameCount = 0;
  private lastFpsUpdate = 0;
  private fpsInterval = 1000;

  constructor(video: HTMLVideoElement, overlayCanvas: HTMLCanvasElement) {
    this.video = video;
    this.overlayCanvas = overlayCanvas;
    this.overlayCtx = overlayCanvas.getContext('2d')!;
    this.detector = new GestureDetector();
    this.filter = new OneEuroFilter2D(1.5, 0.007, 1.0); // minCutoff, beta, dCutoff
  }

  async start(): Promise<void> {
    try {
      // 1. Initialize MediaPipe
      const vision = await FilesetResolver.forVisionTasks(
        `${import.meta.env.BASE_URL}wasm`
      );
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `${import.meta.env.BASE_URL}models/hand_landmarker.task`,
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 2
      });


      // 2. Request camera
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user"
        },
        audio: false
      });
      this.video.srcObject = stream;
      await this.video.play();
      this.active = true;
      this.onLoaded?.();
      this.runLoop();
    } catch (err) {
      this.stop();
      this.onError?.(err as Error);
    }
  }

  private runLoop(): void {
    if (!this.active) return;

    const detectFrame = () => {
      if (!this.active) return;

      if (this.video.currentTime !== this.lastVideoTime && this.video.readyState >= 2) {
        this.lastVideoTime = this.video.currentTime;
        const timestamp = performance.now();

        try {
          const results = this.landmarker!.detectForVideo(this.video, timestamp);
          
          // Calculate Tracking FPS
          this.frameCount++;
          if (timestamp - this.lastFpsUpdate >= this.fpsInterval) {
            const fps = (this.frameCount * 1000) / (timestamp - this.lastFpsUpdate);
            this.onFPS?.(Math.round(fps));
            this.frameCount = 0;
            this.lastFpsUpdate = timestamp;
          }

          if (results.landmarks && results.landmarks.length > 0) {
            const { selected, hand } = selectTrackedHand(results.handedness);
            if (hand !== this.lastHand) { this.detector.reset(); this.filter.reset(); }
            this.lastHand = hand;
            const landmarks = results.landmarks[selected];
            
            // Calculate Centroid (unmirrored normalized coordinates)
            let sumX = 0;
            let sumY = 0;
            for (const lm of landmarks) {
              sumX += lm.x;
              sumY += lm.y;
            }
            const rawX = sumX / landmarks.length;
            const rawY = sumY / landmarks.length;

            // Apply One-Euro filter
            const filtered = this.filter.filter(rawX, rawY, timestamp);

            // Detect Gesture
            const gesture = this.detector.update(landmarks, timestamp);

            // Callback
            this.onUpdate?.({
              rawX,
              rawY,
              filteredX: filtered.x,
              filteredY: filtered.y,
              gesture,
              landmarks,
              hand
            });

            // Draw overlay skeleton
            this.drawSkeleton(landmarks);
          } else {
            // No hand detected
            this.filter.reset();
            this.detector.reset();
            this.lastHand = 'Unknown';
            const gesture: Gesture = 'none';
            this.onUpdate?.({
              rawX: 0.5,
              rawY: 0.5,
              filteredX: 0.5,
              filteredY: 0.5,
              gesture,
              landmarks: null,
              hand: 'Unknown'
            });
            this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
          }
        } catch (e) {
          this.stop();
          this.onError?.(e as Error);
          return;
        }
      }

      // Use requestVideoFrameCallback if available, fallback to requestAnimationFrame
      if ('requestVideoFrameCallback' in this.video) {
        (this.video as any).requestVideoFrameCallback(detectFrame);
      } else {
        requestAnimationFrame(detectFrame);
      }
    };

    if ('requestVideoFrameCallback' in this.video) {
      (this.video as any).requestVideoFrameCallback(detectFrame);
    } else {
      requestAnimationFrame(detectFrame);
    }
  }

  private drawSkeleton(landmarks: Landmark[]): void {
    const ctx = this.overlayCtx;
    const w = this.overlayCanvas.width;
    const h = this.overlayCanvas.height;
    ctx.clearRect(0, 0, w, h);

    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4], // thumb
      [0, 5], [5, 6], [6, 7], [7, 8], // index
      [0, 9], [9, 10], [10, 11], [11, 12], // middle
      [0, 13], [13, 14], [14, 15], [15, 16], // ring
      [0, 17], [17, 18], [18, 19], [19, 20], // pinky
      [5, 9], [9, 13], [13, 17] // palm
    ];

    const style = getComputedStyle(document.documentElement);
    const accentColor = style.getPropertyValue('--accent-color').trim() || '#00f0ff';

    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw lines
    ctx.beginPath();
    for (const [from, to] of connections) {
      const p1 = landmarks[from];
      const p2 = landmarks[to];
      ctx.moveTo(p1.x * w, p1.y * h);
      ctx.lineTo(p2.x * w, p2.y * h);
    }
    ctx.stroke();

    // Draw joints
    ctx.fillStyle = '#ffffff';
    for (const p of landmarks) {
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 4, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  stop(): void {
    this.active = false;
    this.landmarker?.close();
    this.landmarker = null;
    const stream = this.video.srcObject as MediaStream;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    this.video.srcObject = null;
    this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
  }
}
