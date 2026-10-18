import test from 'node:test';
import assert from 'node:assert/strict';
import { RoundFlow } from '../src/roundFlow.ts';
import { rank, readBoard, saveBoard, BOARD_KEY } from '../src/leaderboard.ts';
import { Game } from '../src/game.ts';
import { GestureDetector } from '../src/gestureDetector.ts';

test('规则强制5秒；左手不可启动；右手稳定张开才可启动', () => {
  const f = new RoundFlow();
  assert.equal(f.gesture('open_palm','Right',0),'welcome');
  assert.equal(f.gesture('thumbs_up','Left',100),'rules');
  assert.equal(f.remaining(100),5);
  assert.equal(f.gesture('open_palm','Right',5099),'rules');
  assert.equal(f.gesture('open_palm','Left',5100),'rules');
  assert.equal(f.gesture('open_palm','Left',6000),'rules');
  assert.equal(f.gesture('open_palm','Right',6100),'rules');
  assert.equal(f.gesture('open_palm','Right',6549),'rules');
  assert.equal(f.gesture('open_palm','Right',6550),'playing');
  f.finish();
  assert.equal(f.gesture('thumbs_up','Right',40000),'rules');
  assert.equal(f.remaining(40000),5);
});
test('丢失手部或左右手切换会中断启动手势', () => {
  const f = new RoundFlow(); f.gesture('thumbs_up','Right',0);
  f.gesture('open_palm','Right',6000); f.gesture('none','Unknown',6300);
  assert.equal(f.gesture('open_palm','Right',6500),'rules');
  assert.equal(f.gesture('open_palm','Right',6900),'rules');
  assert.equal(f.gesture('open_palm','Right',6950),'playing');
});
test('榜单前十、稳定同分排序、拒绝异常数据、存储不可用时不崩溃', () => {
  const input = Array.from({length:12},(_,i)=>({id:String(i), name:'玩家'+i, score:i, at:i}));
  const entries = rank([...input,{id:'tie',name:'同分',score:11,at:100}]);
  assert.equal(entries.length,10); assert.equal(entries[0].id,'11'); assert.equal(entries[1].id,'tie');
  assert.deepEqual(readBoard(),[]); assert.equal(saveBoard(entries),false);
  const memory = new Map<string,string>();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>memory.get(k),setItem:(k:string,v:string)=>memory.set(k,v)}});
  assert.equal(saveBoard(entries),true); assert.deepEqual(readBoard(),entries);
  memory.set(BOARD_KEY,'{"bad":true}'); assert.deepEqual(readBoard(),[]);
  memory.set(BOARD_KEY,'broken'); assert.deepEqual(readBoard(),[]);
});
test('30秒绝对截止时间；结束只通知一次', () => {
  let now = 1000;
  const original = performance.now;
  performance.now = () => now;
  try {
    const canvas = {width:1000,height:800,getContext:()=>({})} as unknown as HTMLCanvasElement;
    const g = new Game(canvas); let ended = 0;
    g.onStateChange = state => {if (state === 'GAME_OVER') ended++;};
    g.startGame(); assert.equal(g.timeLeft,30);
    now = 30999; g.update(16); assert.ok(g.timeLeft > 0); assert.equal(g.gameState,'PLAYING');
    now = 31000; g.update(16); assert.equal(g.gameState,'GAME_OVER'); assert.equal(g.timeLeft,0); assert.equal(ended,1);
    g.update(16); assert.equal(ended,1);
    now = 50000; g.startGame(); now = 85000; g.update(100); assert.equal(g.gameState,'GAME_OVER');
  } finally { performance.now = original; }
});
test('丢失追踪时即便光标重叠也不计分', () => {
  const canvas = {width:1000,height:800,getContext:()=>({})} as unknown as HTMLCanvasElement;
  const g = new Game(canvas); g.startGame();
  // Inject deterministic geometry, then exercise the actual collision/update path.
  const internals = g as unknown as {orbs: unknown[]};
  internals.orbs = [{x:500,y:400,radius:20,speed:0,type:'good',pulse:0,spin:0,trail:[]}];
  g.setTrackingPresent(false); g.update(0); assert.equal(g.score,0);
  g.setTrackingPresent(true); g.update(0); assert.equal(g.score,1);
});
test('手势检测重置清除旧手势', () => {
  const d = new GestureDetector();
  d.reset(); assert.equal(d.getDebouncedGesture(),'none'); assert.equal(d.update([],500),'none');
});

import { selectTrackedHand } from '../src/handedness.ts';
test('模型标签经过真实适配器后：左手不启动，右手启动；双手优先真实右手', () => {
  const left = [{categoryName:'Left',score:0.99}];
  const right = [{categoryName:'Right',score:0.99}];
  const f = new RoundFlow(); f.gesture('thumbs_up','Right',0);
  const l = selectTrackedHand([left]);
  assert.equal(l.hand,'Left');
  assert.equal(f.gesture('open_palm',l.hand,5000),'rules');
  assert.equal(f.gesture('open_palm',l.hand,6000),'rules');
  const r = selectTrackedHand([right]);
  assert.equal(r.hand,'Right');
  assert.equal(f.gesture('open_palm',r.hand,7000),'rules');
  assert.equal(f.gesture('open_palm',r.hand,7450),'playing');
  assert.deepEqual(selectTrackedHand([left,right]),{selected:1,hand:'Right'});
  assert.deepEqual(selectTrackedHand([right,left]),{selected:0,hand:'Right'});
  assert.equal(selectTrackedHand([[{categoryName:'Right',score:0.5}]]).hand,'Unknown');
  assert.equal(selectTrackedHand([]).hand,'Unknown');
});

test('重置清空当前局、返回首页；持续点赞不误启动，新点赞重新锁定5秒', () => {
  const canvas = {width:1000,height:800,getContext:()=>({})} as unknown as HTMLCanvasElement;
  const g = new Game(canvas); g.startGame(); g.score = 12; g.reset();
  assert.equal(g.gameState,'START'); assert.equal(g.score,0); assert.equal(g.timeLeft,30);
  const internals = g as unknown as {orbs:unknown[];particles:unknown[]};
  assert.equal(internals.orbs.length,0); assert.equal(internals.particles.length,0);
  g.update(100); assert.equal(g.gameState,'START');
  const f = new RoundFlow(); f.finish(); f.reset();
  assert.equal(f.gesture('thumbs_up','Right',10000),'welcome');
  f.gesture('none','Unknown',10100);
  assert.equal(f.gesture('thumbs_up','Right',10200),'rules');
  assert.equal(f.remaining(10200),5);
  assert.equal(f.gesture('open_palm','Right',15199),'rules');
  f.gesture('open_palm','Right',15200);
  assert.equal(f.gesture('open_palm','Right',15650),'playing');
});

test('真实30秒生成路径的小球数量适度增加，球速与类型分布逻辑保留', () => {
  const originalNow = performance.now, originalRandom = Math.random;
  let now = 0, count = 0;
  performance.now = () => now; Math.random = () => 0.5; // Disable random double-spawn.
  try {
    const canvas = {width:1000,height:800,getContext:()=>({})} as unknown as HTMLCanvasElement;
    const g = new Game(canvas);
    const internals = g as unknown as {spawnOrb:()=>void};
    internals.spawnOrb = () => {count++;};
    g.startGame();
    let oldLast = 0, oldCount = 0;
    for (now=10;now<30000;now+=10) {
      g.update(10);
      const interval = Math.max(280,1200-Math.floor(now/4500)*100);
      if(now-oldLast>=interval){oldCount++;oldLast=now;}
    }
    assert.ok(count > oldCount * 1.15 && count < oldCount * 1.35);
    console.log(`30s deterministic spawn comparison: ${oldCount} -> ${count}`);
  } finally { performance.now=originalNow; Math.random=originalRandom; }
});

test('碰撞路径：第2连起每次固定额外1分，红紫中断，重置清空，结算后不再加分', () => {
  let now=1000; const oldNow=performance.now; performance.now=()=>now;
  try {
    const canvas={width:1000,height:800,getContext:()=>({})} as unknown as HTMLCanvasElement;
    const g=new Game(canvas); const feedback: Array<{delta:number;bonus:number;broken:boolean;type:string}> = [];
    g.onCatch = e => feedback.push(e); g.startGame();
    const hit=(type:'good'|'great'|'bad'|'bomb')=>{g.addDemoOrb(type);g.update(0);};
    for(let i=0;i<4;i++)hit('good');
    assert.equal(g.score,7);assert.equal(g.bonusTotal,3);
    hit('good');assert.equal(g.score,9);assert.equal(g.combo,5);assert.equal(feedback.at(-1)?.delta,2);
    for(let i=0;i<5;i++)hit('good');
    assert.equal(g.score,19);assert.equal(g.bonusTotal,9);assert.equal(g.maxCombo,10);
    assert.deepEqual(feedback.map(e=>e.bonus),[0,1,1,1,1,1,1,1,1,1]);
    hit('bad');assert.equal(g.score,18);assert.equal(g.combo,0);assert.equal(feedback.at(-1)?.broken,true);
    hit('great');assert.equal(g.score,21);assert.equal(g.combo,1);assert.equal(feedback.at(-1)?.delta,3);
    hit('bomb');assert.equal(g.score,18);assert.equal(g.combo,0);
    assert.equal(g.maxCombo,10);assert.equal(g.bonusTotal,9);
    g.startGame();hit('bomb');assert.equal(g.score,0);assert.equal(feedback.at(-1)?.delta,0);
    hit('good');now=31000;g.update(0);assert.equal(g.gameState,'GAME_OVER');
    const score=g.score;hit('great');assert.equal(g.score,score);
    g.reset();assert.equal(g.combo,0);assert.equal(g.maxCombo,0);assert.equal(g.bonusTotal,0);
    g.startGame();assert.equal(g.combo,0);assert.equal(g.score,0);
  } finally {performance.now=oldNow;}
});

import { awardForScore } from '../src/awards.ts';
test('奖项边界：35分银奖、50分金奖；只返回最高奖项，低分清空', () => {
  assert.deepEqual([0,34,35,49,50,100,34].map(awardForScore),[null,null,'silver','silver','gold','gold',null]);
  assert.equal(awardForScore(NaN),null);
});
