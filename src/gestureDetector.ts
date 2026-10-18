export type Gesture = 'none' | 'open_palm' | 'closed_fist' | 'thumbs_up';

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

/**
 * MediaPipe Hand Landmark indices (for reference):
 *
 *  Wrist: 0
 *  Thumb:  CMC=1, MCP=2, IP=3,  TIP=4
 *  Index:  MCP=5, PIP=6, DIP=7, TIP=8
 *  Middle: MCP=9, PIP=10,DIP=11,TIP=12
 *  Ring:   MCP=13,PIP=14,DIP=15,TIP=16
 *  Pinky:  MCP=17,PIP=18,DIP=19,TIP=20
 *
 * Coordinate system: origin at top-left of image.
 *   x: 0 (left) → 1 (right)
 *   y: 0 (top)  → 1 (bottom)  ← smaller y = higher on screen
 */
export class GestureDetector {
  private currentRawGesture: Gesture = 'none';
  private debouncedGesture: Gesture = 'none';
  private gestureStartTime = 0;
  private readonly debounceMs = 150;

  update(landmarks: Landmark[], timestamp: number): Gesture {
    const raw = this.classify(landmarks);

    if (raw !== this.currentRawGesture) {
      this.currentRawGesture = raw;
      this.gestureStartTime = timestamp;
    } else if (timestamp - this.gestureStartTime >= this.debounceMs) {
      this.debouncedGesture = raw;
    }

    return this.debouncedGesture;
  }

  reset() { this.currentRawGesture = 'none'; this.debouncedGesture = 'none'; this.gestureStartTime = 0; }

  getDebouncedGesture(): Gesture {
    return this.debouncedGesture;
  }

  getRawGesture(): Gesture {
    return this.currentRawGesture;
  }

  private classify(landmarks: Landmark[]): Gesture {
    if (!landmarks || landmarks.length < 21) return 'none';

    // ── Finger extension detection ────────────────────────────────────────────
    //
    // For the four non-thumb fingers we compare:
    //   tip.y  vs  pip.y   (PIP = proximal interphalangeal joint, the "big knuckle")
    //
    // In image coordinates y increases downward, so:
    //   tip.y < pip.y  →  tip is ABOVE the pip  →  finger is EXTENDED
    //   tip.y > pip.y  →  tip is BELOW the pip  →  finger is CURLED
    //
    // We add a small threshold (+0.02 in normalised coords ≈ 1% of frame height)
    // to avoid false positives when the finger is nearly horizontal.
    //
    // For the THUMB we cannot use this trick because the thumb rotates along a
    // different axis.  Instead we compare the distance from the thumb TIP to the
    // INDEX-MCP (a stable anchor) versus the distance from the THUMB-MCP to the
    // same anchor: if the tip is farther away, the thumb is sticking out.

    const CURL_THRESHOLD = 0.02; // normalised y units

    const indexExtended  = landmarks[8].y  < landmarks[6].y  - CURL_THRESHOLD;
    const middleExtended = landmarks[12].y < landmarks[10].y - CURL_THRESHOLD;
    const ringExtended   = landmarks[16].y < landmarks[14].y - CURL_THRESHOLD;
    const pinkyExtended  = landmarks[20].y < landmarks[18].y - CURL_THRESHOLD;

    // Thumb: tip (4) vs IP joint (3) – extended when tip is farther from wrist
    // Use 2-D XY distance for the thumb because Z is noisy
    const thumbTipDistFromWrist = Math.hypot(
      landmarks[4].x - landmarks[0].x,
      landmarks[4].y - landmarks[0].y
    );
    const thumbIpDistFromWrist = Math.hypot(
      landmarks[3].x - landmarks[0].x,
      landmarks[3].y - landmarks[0].y
    );
    const thumbExtended = thumbTipDistFromWrist > thumbIpDistFromWrist * 1.1;

    // ── Gesture rules (order matters – most specific first) ───────────────────

    // Open Palm: all five fingers extended
    if (thumbExtended && indexExtended && middleExtended && ringExtended && pinkyExtended) {
      return 'open_palm';
    }

    // Thumbs Up: thumb extended + pointing upward, the other four curled
    // "upward" = thumb tip y is less than (above) the knuckles
    if (
      thumbExtended &&
      !indexExtended && !middleExtended && !ringExtended && !pinkyExtended
    ) {
      // Thumb tip must be above both the index MCP (5) and pinky MCP (17)
      if (landmarks[4].y < landmarks[5].y && landmarks[4].y < landmarks[17].y) {
        return 'thumbs_up';
      }
    }

    // Closed Fist: the four main fingers curled (thumb loosely allowed either way)
    // We check only the four long fingers, not the thumb, because in a real fist
    // the thumb often rests at an indeterminate angle on top.
    if (!indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
      return 'closed_fist';
    }

    return 'none';
  }
}
