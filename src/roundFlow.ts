import type { Gesture } from './gestureDetector';
export type Hand = 'Left' | 'Right' | 'Unknown';
export class RoundFlow {
  phase: 'welcome' | 'rules' | 'playing' | 'results' = 'welcome';
  rulesAt = 0;
  private openSince: number | null = null;
  private lastThumb = false;
  gesture(gesture: Gesture, hand: Hand, now: number) {
    const thumb = gesture === 'thumbs_up';
    if ((this.phase === 'welcome' || this.phase === 'results') && thumb && !this.lastThumb) {
      this.phase = 'rules'; this.rulesAt = now; this.openSince = null;
    } else if (this.phase === 'rules') {
      if (now - this.rulesAt >= 5000 && gesture === 'open_palm' && hand === 'Right') {
        this.openSince ??= now;
        if (now - this.openSince >= 450) this.phase = 'playing';
      } else this.openSince = null;
    }
    this.lastThumb = thumb;
    return this.phase;
  }
  remaining(now: number) { return Math.max(0, Math.ceil((5000 - (now - this.rulesAt)) / 1000)); }
  reset() { this.phase = 'welcome'; this.rulesAt = 0; this.openSince = null; this.lastThumb = true; }
  finish() { this.phase = 'results'; this.openSince = null; }
}
