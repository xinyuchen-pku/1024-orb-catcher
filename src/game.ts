import type { Gesture } from './gestureDetector';

export type CatchType = 'good' | 'great' | 'bad' | 'bomb';
export interface CatchFeedback { type: CatchType; x: number; y: number; delta: number; combo: number; bonus: number; broken: boolean }

// ─── Types ────────────────────────────────────────────────────────────────────

interface Orb {
  x: number;
  y: number;
  radius: number;
  speed: number;
  type: 'good' | 'great' | 'bad' | 'bomb';
  pulse: number;
  spin: number;  // highlight rotation angle
  trail: Array<{ x: number; y: number }>;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
}

interface Star {
  x: number;       // 0–1 normalised
  y: number;       // 0–1 normalised
  radius: number;
  opacity: number;
  layer: 1 | 2 | 3; // near / mid / far for parallax brightness
  twinklePhase: number;
}

export type GameState = 'START' | 'PLAYING' | 'GAME_OVER';

// ─── Utilities ─────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!r) return `rgba(0,0,0,${alpha})`;
  return `rgba(${parseInt(r[1], 16)},${parseInt(r[2], 16)},${parseInt(r[3], 16)},${alpha})`;
}

// ─── Game Class ───────────────────────────────────────────────────────────────

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // ── State ──────────────────────────────────────────────────────────────────
  public gameState: GameState = 'START';
  public score = 0;
  public highScore = 0;
  public combo = 0;
  public maxCombo = 0;
  public bonusTotal = 0;
  public onCatch: ((feedback: CatchFeedback) => void) | null = null;
  public timeLeft = 30.0;
  private roundEndsAt = 0;
  private trackingPresent = false;

  // ── Entities ───────────────────────────────────────────────────────────────
  private orbs: Orb[] = [];
  private particles: Particle[] = [];
  private stars: Star[] = [];
  private cursor = { x: 0, y: 0, targetX: 0, targetY: 0, radius: 28 };

  // ── Spawn / difficulty ─────────────────────────────────────────────────────
  private lastSpawnTime = 0;
  private spawnInterval = 960; // ms
  private gameTimeElapsed = 0;

  // ── Audio ──────────────────────────────────────────────────────────────────
  private audioCtx: AudioContext | null = null;
  private soundEnabled = false;
  public toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    if (this.soundEnabled) { this.initAudio(); void this.audioCtx?.resume(); }
    return this.soundEnabled;
  }

  // ── Screen shake ───────────────────────────────────────────────────────────
  private shakeIntensity = 0;
  private shakeDecay = 0.87;
  private shakeOffsetX = 0;
  private shakeOffsetY = 0;

  // ── Callbacks ──────────────────────────────────────────────────────────────
  public onStateChange: ((state: GameState) => void) | null = null;
  public onScoreChange: ((score: number) => void) | null = null;
  public onTimerChange: ((time: number) => void) | null = null;

  // ─────────────────────────────────────────────────────────────────────────

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.cursor.x = canvas.width / 2;
    this.cursor.y = canvas.height / 2;
    this.cursor.targetX = this.cursor.x;
    this.cursor.targetY = this.cursor.y;

    this.initStars();
  }

  // ─── Stars ─────────────────────────────────────────────────────────────────

  private initStars() {
    this.stars = [];
    for (let i = 0; i < 220; i++) {
      const layer = (Math.floor(Math.random() * 3) + 1) as 1 | 2 | 3;
      this.stars.push({
        x: Math.random(),
        y: Math.random(),
        radius: layer === 1 ? Math.random() * 1.8 + 0.7
               : layer === 2 ? Math.random() * 1.0 + 0.3
               : Math.random() * 0.5 + 0.1,
        opacity: Math.random() * 0.6 + 0.2,
        layer,
        twinklePhase: Math.random() * Math.PI * 2,
      });
    }
  }

  // ─── Audio ─────────────────────────────────────────────────────────────────

  private initAudio() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  private playSound(type: 'catch' | 'great' | 'hurt' | 'bomb' | 'gameover') {
    if (!this.soundEnabled) return;
    this.initAudio();
    if (!this.audioCtx || this.audioCtx.state === 'suspended') return;
    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      const t = this.audioCtx.currentTime;

      if (type === 'catch') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, t);
        osc.frequency.exponentialRampToValueAtTime(880, t + 0.12);
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.start(t); osc.stop(t + 0.12);
      } else if (type === 'great') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(660, t);
        osc.frequency.exponentialRampToValueAtTime(1320, t + 0.22);
        gain.gain.setValueAtTime(0.13, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.start(t); osc.stop(t + 0.22);
      } else if (type === 'hurt') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, t);
        osc.frequency.linearRampToValueAtTime(60, t + 0.25);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.linearRampToValueAtTime(0.001, t + 0.25);
        osc.start(t); osc.stop(t + 0.25);
      } else if (type === 'bomb') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(90, t);
        osc.frequency.linearRampToValueAtTime(25, t + 0.45);
        gain.gain.setValueAtTime(0.22, t);
        gain.gain.linearRampToValueAtTime(0.001, t + 0.45);
        osc.start(t); osc.stop(t + 0.45);
      } else if (type === 'gameover') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, t);
        osc.frequency.linearRampToValueAtTime(80, t + 0.7);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.linearRampToValueAtTime(0.001, t + 0.7);
        osc.start(t); osc.stop(t + 0.7);
      }
    } catch (e) {
      console.warn('Audio synthesis failed', e);
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  public setCursorTarget(normalizedX: number, normalizedY: number) {
    // Mirror X so the hand moves naturally (webcam is mirrored)
    this.cursor.targetX = (1 - normalizedX) * this.canvas.width;
    this.cursor.targetY = normalizedY * this.canvas.height;
  }

  public setTrackingPresent(present: boolean) { this.trackingPresent = present; }
  public reset() {
    this.score = 0;
    this.combo = this.maxCombo = this.bonusTotal = 0;
    this.timeLeft = 30;
    this.roundEndsAt = 0;
    this.orbs = [];
    this.particles = [];
    this.gameTimeElapsed = 0;
    this.lastSpawnTime = 0;
    this.spawnInterval = 960;
    this.shakeIntensity = 0;
    this.shakeOffsetX = this.shakeOffsetY = 0;
    this.trackingPresent = false;
    this.cursor.x = this.cursor.targetX = this.canvas.width / 2;
    this.cursor.y = this.cursor.targetY = this.canvas.height / 2;
    this.setGameState('START');
    this.onScoreChange?.(0);
    this.onTimerChange?.(30);
  }

  // ─── Game State ─────────────────────────────────────────────────────────────

  public startGame() {
    this.score = 0;
    this.combo = this.maxCombo = this.bonusTotal = 0;
    this.timeLeft = 30.0;
    this.roundEndsAt = performance.now() + 30000;
    this.lastSpawnTime = performance.now();
    this.orbs = [];
    this.particles = [];
    this.gameTimeElapsed = 0;
    this.spawnInterval = 960;
    this.setGameState('PLAYING');
    this.onScoreChange?.(this.score);
    this.onTimerChange?.(Math.ceil(this.timeLeft));
  }

  private setGameState(state: GameState) {
    this.gameState = state;
    if (state === 'GAME_OVER') {
      this.playSound('gameover');
      this.highScore = Math.max(this.highScore, this.score);
    }
    this.onStateChange?.(state);
  }

  // ─── Update ─────────────────────────────────────────────────────────────────

  public update(dt: number) {
    // Smooth cursor LERP (always active so it feels alive)
    this.cursor.x += (this.cursor.targetX - this.cursor.x) * 0.18;
    this.cursor.y += (this.cursor.targetY - this.cursor.y) * 0.18;

    // Screen shake
    if (this.shakeIntensity > 0.1) {
      this.shakeOffsetX = (Math.random() - 0.5) * this.shakeIntensity * 2;
      this.shakeOffsetY = (Math.random() - 0.5) * this.shakeIntensity * 2;
      this.shakeIntensity *= this.shakeDecay;
    } else {
      this.shakeIntensity = 0;
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
    }

    this.updateParticles(dt);

    if (this.gameState !== 'PLAYING') return;

    // ── Timers ────────────────────────────────────────────────────────────────
    this.timeLeft = Math.max(0, (this.roundEndsAt - performance.now()) / 1000);
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.onTimerChange?.(0);
      this.setGameState('GAME_OVER');
      return;
    }
    this.onTimerChange?.(Math.ceil(this.timeLeft));

    // ── Difficulty progression ────────────────────────────────────────────────
    this.gameTimeElapsed += dt;
    this.spawnInterval = 0.8 * Math.max(280, 1200 - Math.floor(this.gameTimeElapsed / 4500) * 100);

    // ── Spawn ─────────────────────────────────────────────────────────────────
    const now = performance.now();
    if (now - this.lastSpawnTime >= this.spawnInterval) {
      this.spawnOrb();
      // Double-spawn at high difficulty
      if (this.gameTimeElapsed > 25000 && Math.random() < 0.3) this.spawnOrb();
      this.lastSpawnTime = now;
    }

    // ── Update Orbs ───────────────────────────────────────────────────────────
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const orb = this.orbs[i];

      // Record trail
      orb.trail.push({ x: orb.x, y: orb.y });
      if (orb.trail.length > 12) orb.trail.shift();

      orb.y += orb.speed * dt / 16.6667;
      orb.pulse += 0.04;
      orb.spin  += 0.018;

      // Collision with cursor
      const dx = orb.x - this.cursor.x;
      const dy = orb.y - this.cursor.y;
      if (this.trackingPresent && dx * dx + dy * dy < (orb.radius + this.cursor.radius) ** 2) {
        this.handleCollision(orb);
        this.orbs.splice(i, 1);
        continue;
      }

      // Off screen
      if (orb.y - orb.radius > this.canvas.height) {
        this.orbs.splice(i, 1);
      }
    }
  }

  // ─── Spawn Orb ──────────────────────────────────────────────────────────────

  private spawnOrb() {
    // Probability table: good 55%, great 10%, bad 28%, bomb 7%
    const rand = Math.random();
    const type: Orb['type'] = rand < 0.55 ? 'good'
                            : rand < 0.65 ? 'great'
                            : rand < 0.93 ? 'bad'
                            : 'bomb';

    const baseR = type === 'great' ? 11
                : type === 'bomb'  ? 21
                : 13;
    const radius = baseR + Math.random() * 8;
    const x = radius + Math.random() * (this.canvas.width - radius * 2);
    const baseSpeed = 1.6 + this.gameTimeElapsed / 20000;
    const typeMult  = type === 'great' ? 1.6 : type === 'bomb' ? 0.65 : 1.0;
    const speed = baseSpeed * typeMult * (0.8 + Math.random() * 0.4);

    this.orbs.push({
      x, y: -radius,
      radius, speed,
      type,
      pulse: Math.random() * Math.PI * 2,
      spin: Math.random() * Math.PI * 2,
      trail: [],
    });
  }

  // ─── Collision ──────────────────────────────────────────────────────────────

  private handleCollision(orb: Orb) {
    if (this.gameState !== 'PLAYING' || performance.now() >= this.roundEndsAt) return;
    const previous = this.score;
    const positive = orb.type === 'good' || orb.type === 'great';
    const broken = !positive && this.combo > 0;
    this.combo = positive ? this.combo + 1 : 0;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const bonus = positive && this.combo >= 2 ? 1 : 0;
    switch (orb.type) {
      case 'good':
        this.score += 1;
        this.playSound('catch');
        this.spawnBurst(orb.x, orb.y, '#00c8ff', '#80f0ff', 22);
        break;
      case 'great':
        this.score += 3;
        this.playSound('great');
        this.spawnBurst(orb.x, orb.y, '#ffd700', '#fff0a0', 75);
        this.spawnSparks(orb.x, orb.y, '#ffffff', 25);
        break;
      case 'bad':
        this.score = Math.max(0, this.score - 1);
        this.playSound('hurt');
        this.shakeIntensity = 14;
        this.spawnBurst(orb.x, orb.y, '#ff3b30', '#ff7066', 22);
        break;
      case 'bomb':
        this.score = Math.max(0, this.score - 3);
        this.playSound('bomb');
        this.shakeIntensity = 30;
        this.spawnBurst(orb.x, orb.y, '#cc00ff', '#ff6600', 55);
        this.spawnBurst(orb.x, orb.y, '#ffffff', '#ffffff', 20);
        this.spawnSparks(orb.x, orb.y, '#ff8800', 20);
        break;
    }
    this.score += bonus;
    this.bonusTotal += bonus;
    if (bonus) {
      this.spawnBurst(orb.x, orb.y, '#ffe69a', '#7ffff0', 90);
      this.spawnSparks(orb.x, orb.y, '#ffffff', 32);
      this.shakeIntensity = 6;
    }
    this.onScoreChange?.(this.score);
    this.onCatch?.({type:orb.type, x:orb.x, y:orb.y, delta:this.score-previous, combo:this.combo, bonus, broken});
  }

  // Only wired by the explicitly labelled, non-ranking demo UI.
  public addDemoOrb(type: CatchType) {
    if (this.gameState !== 'PLAYING') return;
    this.trackingPresent = true;
    this.orbs.push({x:this.cursor.x,y:this.cursor.y,radius:18,speed:0,type,pulse:0,spin:0,trail:[]});
  }

  private spawnBurst(x: number, y: number, color1: string, color2: string, count: number) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6;
      const speed = Math.random() * 7 + 1.5;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: Math.random() * 4 + 1.5,
        color: Math.random() < 0.5 ? color1 : color2,
        alpha: 1.0, life: 0,
        maxLife: 28 + Math.random() * 24,
      });
    }
  }

  private spawnSparks(x: number, y: number, color: string, count: number) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 14 + 6;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: Math.random() * 1.2 + 0.4,
        color,
        alpha: 1.0, life: 0,
        maxLife: 12 + Math.random() * 10,
      });
    }
  }

  // ─── Particles Update ────────────────────────────────────────────────────────

  private updateParticles(dt: number) {
    const dtFrames = dt / 16.666;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x  += p.vx;
      p.y  += p.vy;
      p.vy += 0.1;            // gravity
      p.life += dtFrames;
      p.alpha = Math.max(0, 1 - p.life / p.maxLife);
      if (p.life >= p.maxLife) { this.particles.splice(i, 1); }
    }

    // Ambient rising motes
    if (this.gameState === 'PLAYING' && Math.random() < 0.3) {
      this.particles.push({
        x: Math.random() * this.canvas.width,
        y: this.canvas.height + 8,
        vx: (Math.random() - 0.5) * 0.5,
        vy: -(Math.random() * 0.9 + 0.4),
        radius: Math.random() * 1.4 + 0.3,
        color: Math.random() < 0.6 ? '#00c8ff' : '#6d28d9',
        alpha: 0.18, life: 0,
        maxLife: 200 + Math.random() * 120,
      });
    }
  }

  // ─── Draw ────────────────────────────────────────────────────────────────────

  public draw(currentGesture: Gesture) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const now = performance.now();

    ctx.save();
    if (this.shakeIntensity > 0) ctx.translate(this.shakeOffsetX, this.shakeOffsetY);

    this.drawBackground(w, h, now);
    this.drawParticles();
    for (const orb of this.orbs) this.drawOrb(orb, now);
    if (this.gameState === 'PLAYING' && this.trackingPresent) this.drawPlayerCursor(currentGesture, now);

    ctx.restore();
  }

  // ─── Background ──────────────────────────────────────────────────────────────

  private drawBackground(w: number, h: number, now: number) {
    const ctx = this.ctx;

    // Deep space gradient
    const bg = ctx.createRadialGradient(w / 2, h * 0.25, 0, w / 2, h * 0.25, Math.max(w, h) * 0.85);
    bg.addColorStop(0, '#0c0f1e');
    bg.addColorStop(0.6, '#070910');
    bg.addColorStop(1, '#020204');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    this.drawStars(w, h, now);
    this.drawPerspectiveGrid(w, h, now);

    // Cinematic edge vignette
    const ev = ctx.createRadialGradient(w / 2, h / 2, h * 0.38, w / 2, h / 2, h * 0.88);
    ev.addColorStop(0, 'rgba(0,0,0,0)');
    ev.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = ev;
    ctx.fillRect(0, 0, w, h);
  }

  private drawStars(w: number, h: number, now: number) {
    const ctx = this.ctx;
    for (const s of this.stars) {
      const twinkle = 0.55 + 0.45 * Math.sin(now / 900 + s.twinklePhase);
      const alpha = s.opacity * twinkle;
      const sx = s.x * w, sy = s.y * h;

      ctx.save();
      ctx.globalAlpha = alpha;

      if (s.radius > 1.2) {
        // Bloom glow for bigger stars
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, s.radius * 4);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.3, `rgba(180,220,255,${alpha * 0.5})`);
        g.addColorStop(1, 'rgba(100,160,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(sx, sy, s.radius * 4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#ccdaff';
        ctx.beginPath();
        ctx.arc(sx, sy, s.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawPerspectiveGrid(w: number, h: number, now: number) {
    const ctx = this.ctx;
    const gc = '0,200,255'; // RGB for grid color

    // Horizon: 40% down screen, vanishing point at center-top
    const vy = h * 0.40;
    const vx = w / 2;

    // Animate horizontal lines scrolling towards viewer
    const scroll = (now * 0.00014) % 1;
    const numH = 20;

    ctx.save();
    ctx.lineWidth = 0.8;

    // Horizontal lines
    for (let i = 0; i < numH; i++) {
      const t = (i + scroll) / numH;
      const perspT = t * t;               // quadratic bunching near horizon
      const y = vy + (h - vy) * perspT;
      if (y < vy - 1 || y > h + 2) continue;
      const alpha = Math.min(0.25, perspT * 0.28);
      ctx.strokeStyle = `rgba(${gc},${alpha})`;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Vertical lines converging to vanishing point
    const numV = 22;
    for (let i = 0; i <= numV; i++) {
      const xb = (i / numV) * w;
      const distEdge = Math.abs(i / numV - 0.5) * 2; // 0=center, 1=edge
      const alpha = 0.07 + distEdge * 0.08;
      ctx.strokeStyle = `rgba(${gc},${alpha})`;
      ctx.beginPath();
      ctx.moveTo(vx, vy);
      ctx.lineTo(xb, h);
      ctx.stroke();
    }

    // Glowing horizon line
    const hGrad = ctx.createLinearGradient(0, vy, w, vy);
    hGrad.addColorStop(0,   'rgba(0,0,0,0)');
    hGrad.addColorStop(0.2, `rgba(${gc},0.15)`);
    hGrad.addColorStop(0.5, `rgba(${gc},0.35)`);
    hGrad.addColorStop(0.8, `rgba(${gc},0.15)`);
    hGrad.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = hGrad;
    ctx.shadowBlur = 12;
    ctx.shadowColor = `rgba(${gc},0.6)`;
    ctx.beginPath();
    ctx.moveTo(0, vy);
    ctx.lineTo(w, vy);
    ctx.stroke();

    ctx.restore();
  }

  // ─── Particles Draw ───────────────────────────────────────────────────────────

  private drawParticles() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      if (p.alpha <= 0) continue;
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.alpha);
      if (p.radius > 1.5) {
        ctx.shadowBlur = 8;
        ctx.shadowColor = p.color;
      }
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ─── Orb Draw ─────────────────────────────────────────────────────────────────

  private drawOrb(orb: Orb, now: number) {
    const ctx = this.ctx;
    const pulse = Math.sin(orb.pulse) * 2.0;
    const r = orb.radius + pulse;

    // Per-type palette
    type OrbPalette = { core: string; glow: string; hiLight: string; rim: string };
    const palette: OrbPalette =
      orb.type === 'good'  ? { core: '#005fa3', glow: '#00c8ff', hiLight: '#a0f0ff', rim: '#00e0ff' }
    : orb.type === 'great' ? { core: '#a36200', glow: '#ffc400', hiLight: '#fff0a0', rim: '#ffd700' }
    : orb.type === 'bad'   ? { core: '#9b1200', glow: '#ff3b30', hiLight: '#ffa090', rim: '#ff5548' }
    :                        { core: '#280040', glow: '#9b00e0', hiLight: '#e090ff', rim: '#cc00ff' };

    // ── Trail ─────────────────────────────────────────────────────────────────
    for (let i = 0; i < orb.trail.length; i++) {
      const frac = i / orb.trail.length;
      const tr = r * frac * 0.65;
      if (tr < 1) continue;
      ctx.save();
      ctx.globalAlpha = frac * 0.22;
      ctx.shadowBlur = 6;
      ctx.shadowColor = palette.glow;
      ctx.fillStyle = palette.glow;
      ctx.beginPath();
      ctx.arc(orb.trail[i].x, orb.trail[i].y, tr, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();

    // ── Outer volumetric halo ─────────────────────────────────────────────────
    const haloR = r * 2.4 + Math.sin(now / 380 + orb.pulse) * 3;
    const haloGrad = ctx.createRadialGradient(orb.x, orb.y, r * 0.6, orb.x, orb.y, haloR);
    haloGrad.addColorStop(0, hexToRgba(palette.glow, 0.18));
    haloGrad.addColorStop(0.5, hexToRgba(palette.glow, 0.07));
    haloGrad.addColorStop(1, hexToRgba(palette.glow, 0));
    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, haloR, 0, Math.PI * 2);
    ctx.fill();

    // ── 3D sphere body ────────────────────────────────────────────────────────
    // Primary light source: upper-left offset
    const hx = orb.x - r * 0.38;
    const hy = orb.y - r * 0.38;
    const sphere = ctx.createRadialGradient(hx, hy, r * 0.04, orb.x, orb.y, r * 1.02);
    sphere.addColorStop(0.00, palette.hiLight);
    sphere.addColorStop(0.22, palette.glow);
    sphere.addColorStop(0.62, palette.core);
    sphere.addColorStop(0.88, '#090910');
    sphere.addColorStop(1.00, '#000000');

    ctx.shadowBlur = 28;
    ctx.shadowColor = palette.glow;
    ctx.fillStyle = sphere;
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, r, 0, Math.PI * 2);
    ctx.fill();

    // ── Primary specular highlight (rotates for liquid look) ──────────────────
    const specA = orb.spin;
    const sx1 = orb.x + Math.cos(specA) * r * 0.28 - r * 0.08;
    const sy1 = orb.y + Math.sin(specA) * r * 0.28 - r * 0.22;
    const spec1 = ctx.createRadialGradient(sx1, sy1, 0, sx1, sy1, r * 0.55);
    spec1.addColorStop(0,   'rgba(255,255,255,0.92)');
    spec1.addColorStop(0.35,'rgba(255,255,255,0.35)');
    spec1.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.shadowBlur = 0;
    ctx.fillStyle = spec1;
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, r, 0, Math.PI * 2);
    ctx.fill();

    // ── Secondary specular (opposite quadrant, environment reflection) ─────────
    const sx2 = orb.x + r * 0.38;
    const sy2 = orb.y + r * 0.38;
    const spec2 = ctx.createRadialGradient(sx2, sy2, 0, sx2, sy2, r * 0.35);
    spec2.addColorStop(0, hexToRgba(palette.hiLight, 0.28));
    spec2.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = spec2;
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, r, 0, Math.PI * 2);
    ctx.fill();

    // ── Thin rim light ────────────────────────────────────────────────────────
    ctx.strokeStyle = palette.rim;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, r, 0, Math.PI * 2);
    ctx.stroke();

    // ── Outer ring pulse ──────────────────────────────────────────────────────
    ctx.strokeStyle = palette.glow;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.2 + 0.12 * Math.sin(now / 300 + orb.pulse);
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, r + 5, 0, Math.PI * 2);
    ctx.stroke();

    // ── Drop shadow ellipse ───────────────────────────────────────────────────
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(orb.x, orb.y + r * 0.88, r * 0.75, r * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;

    // ── Type emoji icon ───────────────────────────────────────────────────────
    if (orb.type === 'bomb' || orb.type === 'great') {
      ctx.shadowBlur = 0;
      ctx.font = `bold ${Math.round(r * 0.88)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.82;
      ctx.fillText(orb.type === 'bomb' ? '💀' : '⭐', orb.x, orb.y + 1);
    }

    ctx.restore();
  }

  // ─── Cursor Draw ─────────────────────────────────────────────────────────────

  private drawPlayerCursor(gesture: Gesture, now: number) {
    const ctx = this.ctx;
    const { x, y, radius } = this.cursor;

    // Determine color scheme
    let color = '#00c8ff';
    let shadow = '#00c8ff';
    let rings = 2;
    let isFist = false;

    if (gesture === 'closed_fist') {
      color = '#ffaa00'; shadow = '#ffcc44'; rings = 1; isFist = true;

    } else if (gesture === 'thumbs_up') {
      color = '#10b981'; shadow = '#10b981';
    }

    ctx.save();

    // ── Soft ambient glow ─────────────────────────────────────────────────────
    const glowPulse = 0.65 + 0.35 * Math.sin(now / 380);
    const ambient = ctx.createRadialGradient(x, y, radius * 0.4, x, y, radius * 4);
    ambient.addColorStop(0, hexToRgba(color, 0.14 * glowPulse));
    ambient.addColorStop(1, hexToRgba(color, 0));
    ctx.fillStyle = ambient;
    ctx.beginPath();
    ctx.arc(x, y, radius * 4, 0, Math.PI * 2);
    ctx.fill();

    // ── Rotating rings ────────────────────────────────────────────────────────
    const ringDefs = [
      { r: radius,       speed:  1.0,  dash: [10, 16], lw: 2.0, alpha: 1.0 },
      { r: radius * 1.5, speed: -0.55, dash: [6,  12], lw: 1.4, alpha: 0.7 },
      { r: radius * 2.1, speed:  0.35, dash: [3,  9],  lw: 1.0, alpha: 0.45 },
    ];

    if (!isFist) {
      for (let i = 0; i < rings; i++) {
        const rd = ringDefs[i];
        const angle = (now / 1000) * Math.PI * rd.speed;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.shadowBlur = 12;
        ctx.shadowColor = shadow;
        ctx.strokeStyle = color;
        ctx.lineWidth = rd.lw;
        ctx.globalAlpha = rd.alpha;
        ctx.setLineDash(rd.dash);
        ctx.beginPath();
        ctx.arc(0, 0, rd.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    } else {
      // Fist: pulsing contracted ring
      const fp = 0.75 + 0.25 * Math.sin(now / 90);
      ctx.shadowBlur = 22;
      ctx.shadowColor = shadow;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = fp;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.72, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ── Inner dot gradient ────────────────────────────────────────────────────
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    const dotG = ctx.createRadialGradient(x - 2, y - 2, 0, x, y, 8);
    dotG.addColorStop(0, '#ffffff');
    dotG.addColorStop(0.4, color);
    dotG.addColorStop(1, hexToRgba(color, 0.2));
    ctx.shadowBlur = 18;
    ctx.shadowColor = shadow;
    ctx.fillStyle = dotG;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();

    // ── Crosshair tick marks ──────────────────────────────────────────────────
    const tr = radius + 12;
    const tl = 9;
    ctx.shadowBlur = 6;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(x - tr, y);     ctx.lineTo(x - tr + tl, y);
    ctx.moveTo(x + tr, y);     ctx.lineTo(x + tr - tl, y);
    ctx.moveTo(x, y - tr);     ctx.lineTo(x, y - tr + tl);
    ctx.moveTo(x, y + tr);     ctx.lineTo(x, y + tr - tl);
    ctx.stroke();

    // ── Gesture label badge ───────────────────────────────────────────────────
    if (gesture !== 'none') {
      const label = { open_palm: '张开手掌', closed_fist: '握拳', thumbs_up: '点赞' }[gesture];
      ctx.shadowBlur = 0;
      ctx.font = '10px monospace';
      const tw = ctx.measureText(label).width;
      const bw = tw + 16, bh = 18;
      const bx = x - bw / 2, by = y - radius - 34;
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = 'rgba(4,5,12,0.85)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, by + bh / 2 + 0.5);
    }

    ctx.restore();
  }

  // ─── Resize ───────────────────────────────────────────────────────────────────

  public resize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.cursor.x = Math.min(width, this.cursor.x);
    this.cursor.y = Math.min(height, this.cursor.y);
    this.initStars();
  }
}
