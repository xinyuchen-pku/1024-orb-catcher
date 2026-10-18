import './style.css';
import { AWARD_THRESHOLDS, awardForScore } from './awards';
import { HandTracker } from './handTracker';
import { Game } from './game';
import type { CatchType, CatchFeedback } from './game';
import { RoundFlow } from './roundFlow';
import type { Hand } from './roundFlow';
import type { Gesture } from './gestureDetector';
import { rank, readBoard, saveBoard } from './leaderboard';
import type { Entry } from './leaderboard';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
$('silver-threshold').textContent = `${AWARD_THRESHOLDS.silver}–${AWARD_THRESHOLDS.gold - 1} 分`;
$('gold-threshold').textContent = `${AWARD_THRESHOLDS.gold} 分及以上`;
const game = new Game($<HTMLCanvasElement>('game-canvas'));
const tracker = new HandTracker($<HTMLVideoElement>('webcam'), $<HTMLCanvasElement>('webcam-overlay'));
const flow = new RoundFlow();
const demo = new URLSearchParams(location.search).get('demo') === '1';
let latestGesture: Gesture = 'none';
let lastTrackingAt = 0;
let cameraLoading = false;
let cameraReady = false;
let board = readBoard();
let pending: Entry | null = null;
let saved = false;
const names: Record<Gesture, string> = {none:'请完整展示手掌', open_palm:'张开手掌',closed_fist:'握拳',thumbs_up:'点赞'};

function show(id: string) {
  for (const name of ['start-screen','rules-screen','game-over-screen']) $(name).classList.toggle('active', name === id);
}
function displayBoard() {
  const list = $('leaderboard-list'); list.replaceChildren();
  if (!board.length) {
    const item = document.createElement('li'); item.className = 'empty-board'; item.textContent = '星光榜虚位以待，成为第一位捕手。'; list.append(item);
  }
  board.forEach((entry, i) => {
    const item = document.createElement('li'); if (entry.id === pending?.id) item.className = 'current';
    const number = document.createElement('span'); number.className = 'rank'; number.textContent = String(i+1).padStart(2,'0');
    const name = document.createElement('span'); name.className = 'name'; name.textContent = entry.name;
    const score = document.createElement('strong'); score.textContent = String(entry.score);
    item.append(number, name, score); list.append(item);
  });
  $('high-score').textContent = String(Math.max(game.score, board[0]?.score ?? 0));
}
function recordScore() {
  if (!pending || saved || demo) return;
  pending.name = $<HTMLInputElement>('player-name').value.trim().slice(0,12) || '星际玩家';
  board = rank([...board, pending]);
  const persistent = saveBoard(board); saved = true;
  $('save-status').textContent = persistent ? (board.some(e=>e.id === pending?.id) ? '成绩已保存，星光榜上见！' : '挑战已完成，继续冲击本机前 10 名！') : '浏览器无法保存：成绩仅在本次页面中保留。';
  $<HTMLButtonElement>('save-score').disabled = true;
  $<HTMLInputElement>('player-name').disabled = true;
  displayBoard();
}
$('save-score').addEventListener('click', recordScore);
$('reset-game').addEventListener('click', () => {
  recordScore();
  pending = null;
  saved = false;
  latestGesture = 'none';
  flow.reset();
  game.reset();
});
$('player-name').addEventListener('keydown', e => { if (e.key === 'Enter') recordScore(); });

function handle(gesture: Gesture, hand: Hand, now: number) {
  const before = flow.phase;
  const next = flow.gesture(gesture, hand, now);
  if (before !== next && next === 'rules') {
    recordScore(); show('rules-screen'); $('game-hud').classList.add('hidden'); updateRules(now);
  }
  if (before !== next && next === 'playing') game.startGame();
}
function updateRules(now: number) {
  if (flow.phase !== 'rules') return;
  const remaining = flow.remaining(now);
  $('rules-progress').style.width = `${Math.min(100, (now - flow.rulesAt) / 50)}%`;
  $('rules-prompt').textContent = remaining > 0 ? `请先阅读规则，${remaining} 秒后解锁` : '🖐️ 已解锁！请张开右手，保持片刻';
  $<HTMLButtonElement>('demo-open').disabled = remaining > 0;
}
game.onStateChange = state => {
  document.body.classList.toggle('playing', state === 'PLAYING');
  if (state !== 'PLAYING') clearEffects();
  else { clearEffects(); updateCombo(0); }
  $('demo-catches').hidden = !demo || state !== 'PLAYING';
  if (state === 'START') { show('start-screen'); $('game-hud').classList.add('hidden'); }
  if (state === 'PLAYING') { show(''); $('game-hud').classList.remove('hidden'); }
  if (state === 'GAME_OVER') {
    flow.finish(); show('game-over-screen'); $('game-hud').classList.add('hidden');
    $('final-score').textContent = String(game.score);
    const award = awardForScore(game.score);
    $('result-award').hidden = !award;
    $('result-award').className = award ? `result-award ${award}` : 'result-award';
    $('award-medal').textContent = award === 'gold' ? '🥇' : award === 'silver' ? '🥈' : '';
    $('award-name').textContent = award === 'gold' ? '金奖' : award === 'silver' ? '银奖' : '';

    $('final-combo').textContent = String(game.maxCombo);
    $('final-bonus').textContent = '+' + game.bonusTotal;
    $('result-message').textContent = game.score > (board[0]?.score ?? 0) ? '新的本机最高分！这一次，你点亮了星空。' : '下一次，捕捉更多可能。';
    pending = {name:'星际玩家', score:game.score, at:Date.now(), id:crypto.randomUUID()}; saved = false;
    $<HTMLInputElement>('player-name').disabled = demo;
    $<HTMLInputElement>('player-name').value = '';
    $<HTMLButtonElement>('save-score').disabled = demo;
    $('save-status').textContent = demo ? '演示成绩不保存，也不会进入正式榜单。' : '输入昵称后记录，或直接点赞以游客身份再来一局。';
    displayBoard();
  }
};
game.onScoreChange = score => { $('hud-score').textContent = String(score).padStart(3,'0'); };
game.onTimerChange = time => { $('hud-timer').textContent = String(time); };
tracker.onLoaded = () => {
  cameraLoading = false; cameraReady = true; $('camera-placeholder').style.display = 'none';
  $('tracking-badge').textContent = '已连接'; $('camera-start').textContent = '摄像头已就绪 ✓';
  $('welcome-prompt').textContent = '对镜头比一个 👍，开启你的星际挑战';
};
tracker.onError = error => {
  cameraLoading = false; cameraReady = false; game.setTrackingPresent(false); latestGesture = 'none';
  $('tracking-badge').textContent = '连接失败'; $('tracking-badge').className = 'badge badge-error';
  $('error-fallback').classList.add('active');
  const messages: Record<string,string> = {NotAllowedError:'未获得摄像头权限，请允许访问后重试。', NotFoundError:'没有找到摄像头，请连接摄像头后重试。',NotReadableError:'摄像头可能被其他应用占用，请关闭占用后重试。'};
  $('error-message').textContent = messages[error.name] || '手势识别暂时不可用。请使用支持 WebGL 的现代浏览器，并确认模型文件完整。';
  $<HTMLButtonElement>('camera-start').disabled = false; $('camera-start').textContent = '重新连接摄像头';
};
tracker.onUpdate = data => {
  lastTrackingAt = performance.now(); latestGesture = data.landmarks ? data.gesture : 'none';
  game.setTrackingPresent(Boolean(data.landmarks));
  $('tracking-badge').className = 'badge';
  $('tracking-badge').textContent = data.landmarks ? '追踪中' : '等待手掌';
  $('detected-gesture').textContent = data.landmarks ? `${data.hand === 'Right' ? '右手' : data.hand === 'Left' ? '左手' : '方向待确认'} · ${names[data.gesture]}` : '请将手掌放入画面';
  if (data.landmarks) game.setCursorTarget(data.filteredX, data.filteredY);
  handle(latestGesture, data.hand, performance.now());
};
async function startCamera() {
  if (cameraLoading || cameraReady || demo) return;
  cameraLoading = true; $('error-fallback').classList.remove('active');
  $('tracking-badge').textContent = '正在加载'; $('camera-start').textContent = '正在准备手势识别…'; $<HTMLButtonElement>('camera-start').disabled = true;
  await tracker.start();
}
$('camera-start').addEventListener('click', startCamera);
$('retry-camera').addEventListener('click', startCamera);
$('dismiss-error').addEventListener('click', () => $('error-fallback').classList.remove('active'));
$('sound-toggle').addEventListener('click', () => {
  const enabled = game.toggleSound(); $('sound-toggle').textContent = enabled ? '关闭音效' : '开启音效'; $('sound-toggle').setAttribute('aria-pressed',String(enabled));
});
function resize() { game.resize(innerWidth, innerHeight); }
addEventListener('resize', resize); resize();
addEventListener('pagehide', () => tracker.stop());
// The absolute deadline also applies when the page was backgrounded.
document.addEventListener('visibilitychange', () => { game.update(0); latestGesture = 'none'; game.setTrackingPresent(false); });
let last = performance.now();
function frame(now: number) {
  if (!demo && now - lastTrackingAt > 500) { latestGesture = 'none'; game.setTrackingPresent(false); flow.gesture('none','Unknown',now); }
  updateRules(now);
  game.update(Math.min(100, now-last)); game.draw(latestGesture); last = now;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
if (demo) {
  $('demo-controls').hidden = false; $('preview-label').textContent = '演示预览';
  $('camera-start').textContent = '演示模式'; $<HTMLButtonElement>('camera-start').disabled = true;
  $('welcome-prompt').textContent = '使用下方模拟按钮预览流程；正式版由真实手势触发。';
  $('tracking-badge').textContent = '演示'; $('camera-placeholder').innerHTML = '✋<span>演示不启用摄像头</span>';
  $('demo-thumb').addEventListener('click', () => { handle('none','Right',performance.now()); handle('thumbs_up','Right',performance.now()); });
  $('demo-open').addEventListener('click', () => {
    handle('open_palm','Right',performance.now());
    setTimeout(() => handle('open_palm','Right',performance.now()), 480);
  });
  addEventListener('pointermove', e => { game.setCursorTarget(1-e.clientX/innerWidth,e.clientY/innerHeight); game.setTrackingPresent(true); latestGesture = 'open_palm'; });
}

function clearEffects() {
  for (const el of [$('catch-effects'), $('combo-announcement')]) {
    el.getAnimations({subtree:true}).forEach(a => a.cancel()); el.replaceChildren();
  }
}
function updateCombo(combo: number) {
  $('combo-count').textContent = String(combo);
  $('combo-next').textContent = combo ? '下一连固定额外 +1 分' : '第 2 连起，每次额外 +1';
  $('combo-hud').classList.toggle('charged',combo >= 2);
}
function catchFeedback(f: CatchFeedback) {
  updateCombo(f.combo);
  const layer = $('catch-effects');
  while (layer.childElementCount >= 8) layer.firstElementChild?.remove();
  const el = document.createElement('div'); el.className = `catch-popup ${f.type}`;
  const x = Math.max(115,Math.min(innerWidth-115,f.x));
  const y = Math.max(185,Math.min(innerHeight-160,f.y));
  for (const previous of Array.from(layer.children) as HTMLElement[]) {
    if (Math.abs(parseFloat(previous.style.left)-x)<90 && Math.abs(parseFloat(previous.style.top)-y)<55) {
      previous.getAnimations().forEach(a=>a.cancel()); previous.remove();
    }
  }
  el.style.left = `${x}px`; el.style.top = `${y}px`;
  const word = document.createElement('strong'); word.textContent = f.type === 'bad' ? 'Wrong Answer' : f.type === 'bomb' ? 'Runtime Error' : 'Accepted';
  const detail = document.createElement('span');
  detail.textContent = `${f.delta === 0 && (f.type === 'bad' || f.type === 'bomb') ? '0 分（已达最低分）' : `${f.delta >= 0 ? '+' : ''}${f.delta} 分`}${f.bonus ? ` · 含连击奖励 +${f.bonus}` : f.broken ? ' · 连击中断' : ''}`;
  const ring = document.createElement('i'); ring.className = 'catch-ring';
  el.append(ring,word,detail); layer.append(el);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animation = el.animate(reduced ? [{opacity:1},{opacity:1,offset:.7},{opacity:0}] : [
    {opacity:0,transform:'translate(-50%, -30%) scale(.55)'},
    {opacity:1,transform:`translate(-50%, -50%) scale(${f.type === 'great' ? 1.22 : 1.08})`,offset:.16},
    {opacity:1,transform:'translate(-50%, -65%) scale(1)',offset:.6},
    {opacity:0,transform:'translate(-50%, -120%) scale(.95)'}
  ],{duration:f.type === 'great' ? 1600 : 1300,easing:'cubic-bezier(.16,1,.3,1)'});
  animation.onfinish = () => el.remove();
  if (f.combo >= 2) {
    const host = $('combo-announcement'); host.replaceChildren();
    const banner = document.createElement('div'); banner.className = 'combo-burst milestone';
    const label = document.createElement('span'); label.textContent = '连续捕获';
    const num = document.createElement('strong'); num.textContent = `${f.combo} 连！`;
    const reward = document.createElement('b'); reward.textContent = `额外 +${f.bonus} 分`;
    banner.append(label,num,reward); host.append(banner);
    const a = banner.animate(reduced ? [{opacity:1},{opacity:0}] : [
      {opacity:0,transform:'scale(1.65) rotate(-6deg)',filter:'blur(7px)'},
      {opacity:1,transform:'scale(.95) rotate(-3deg)',filter:'blur(0)',offset:.16},
      {opacity:1,transform:'scale(1) rotate(-3deg)',offset:.65},
      {opacity:0,transform:'scale(1.05) translateY(-20px) rotate(-3deg)'}
    ],{duration:1400,easing:'cubic-bezier(.16,1,.3,1)'});
    a.onfinish = () => banner.remove();
  } else if (f.broken) $('combo-announcement').replaceChildren();
}
game.onCatch = catchFeedback;
if (demo) {
  document.querySelectorAll<HTMLButtonElement>('[data-catch]').forEach(button => button.addEventListener('click', () => game.addDemoOrb(button.dataset.catch as CatchType)));
  $('demo-combo').addEventListener('click', () => { for(let i=0;i<5;i++) game.addDemoOrb('great'); });
}
