import {cpSync,mkdirSync,existsSync} from 'node:fs';
mkdirSync('public/wasm',{recursive:true});
cpSync('node_modules/@mediapipe/tasks-vision/wasm','public/wasm',{recursive:true});
if (!existsSync('public/models/hand_landmarker.task')) throw new Error('本地识别模型缺失，请恢复 public/models/hand_landmarker.task');
mkdirSync('public/licenses',{recursive:true});
for (const file of ['LICENSE','MEDIAPIPE-LICENSE.txt','THIRD_PARTY_NOTICES.md']) cpSync(file,`public/licenses/${file}`);
