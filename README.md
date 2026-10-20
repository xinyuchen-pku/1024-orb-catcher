# 1024程序员艺术节小游戏：星球捕手

基于 [ihemu45/orb-catcher](https://github.com/ihemu45/orb-catcher)（MIT）制作的中文 1024程序员艺术节版本。完整保留原作者许可证。本包包含可直接托管的 `dist/`、源代码、固定依赖清单、手部识别模型和 WASM 运行文件；游戏不依赖 CDN 或在线字体。

## 直接运行完整包

macOS：双击 `启动游戏.command`，在浏览器打开终端显示的地址。需要 Python 3（不需要安装 npm 依赖）。其他系统运行 `python3 serve.py` 或 `python serve.py`。也可使用 Node 22.18+ 运行 `node scripts/serve.mjs`。

- 正式游戏：http://127.0.0.1:5174/
- 演示流程：http://127.0.0.1:5174/?demo=1

不要双击 `dist/index.html`：摄像头与模型加载需要 HTTP localhost 或 HTTPS。停止本地服务时在启动终端按 Ctrl+C。

## 游戏流程

1. 点击开启摄像头，允许浏览器访问镜头；视频仅在本机处理。
2. 对镜头竖起大拇指，进入规则说明。
3. 规则强制显示至少 5 秒，期间不能开始。
4. 解锁后张开**右手**并保持约半秒，开始挑战（左手不会触发）。建议手指朝上、掌心对镜头，整只手入镜。
5. 移动手掌，光标接触球即计分：蓝 +1、金 +3、红 −1、炸弹 −3，最低 0 分；无需握拳。蓝球显示蓝色 Accepted，金球显示强化金色 Accepted，红球显示 Wrong Answer，紫球显示 Runtime Error。蓝/金球累计连击，第1击无额外奖励，从第2连起每次固定额外+1分，屏幕逐次弹出“n 连！”；红/紫球中断，漏球不中断。结算显示最高连击与奖励总分。已取消比耶减速。小球生成间隔为之前的80%，同阶段生成频率提高25%，球速和分值不变。
6. 每局固定 30 秒，握拳、手部离开镜头和切到后台均不会暂停或增加时间。结束后展示结果。按最终得分（含连击奖励）评奖：35–49分为银奖，50分及以上为金奖；只显示最高奖项，低于35分不显示奖牌。
7. 输入昵称并记录成绩，进入当前浏览器本机前 10 名榜单。也可直接点赞，以“星际玩家”记录并重玩。重玩仍必须阅读规则 5 秒。同分按达成时间排序。结束界面的“重置并返回首页”会记录本局成绩、保留榜单并清空当前局，重新点赞后仍需阅读规则5秒。

榜单不是跨设备共享榜单；更换浏览器、清除网站数据会影响榜单。浏览器禁止存储时显示提示并在当前页面临时保留。演示模式使用模拟按钮和鼠标，成绩不会存入正式榜单。

## 源码开发与验证

Node 22.18+，npm：

```sh
npm ci
npm test
npm run dev
npm run build
```

构建前会从锁定的 MediaPipe 依赖复制 WASM 到 `public/wasm/`。模型位于 `public/models/hand_landmarker.task`。`ASSET_MANIFEST.json` 记录来源、大小和 SHA256。升级依赖后需重新生成清单并验证真手追踪。

`src/roundFlow.ts` 管理规则与开局；`src/game.ts` 管理原版画布玩法与绝对时间截止；`src/handTracker.ts` 管理相机与左右手识别；`src/leaderboard.ts` 管理榜单；`src/main.ts` 连接界面。摄像头原帧不镜像，显示层镜像，左右手标签直接采用当前模型输出，不做交换；CSS 和光标的镜像仅影响显示坐标。

## GitHub Pages

仓库：[xinyuchen-pku/1024-orb-catcher](https://github.com/xinyuchen-pku/1024-orb-catcher)，发布分支 `main`。游戏地址：https://xinyuchen-pku.github.io/1024-orb-catcher/ 。

已准备 `.github/workflows/deploy.yml`：推送 main 后，安装固定依赖、运行测试、构建并发布 dist。仓库 Settings → Pages → Source 选择 GitHub Actions。Vite 使用相对 base，兼容仓库子路径与自定义域名。上线后还须验证 Actions 成功、实际 Pages 地址及摄像头权限。

## 验收范围

见 `STATUS.md`。自动化覆盖 5 秒门槛、左右手开局门槛、30 秒绝对截止、追踪丢失不计分、榜单排序和存储异常。浏览器演示检查不等于真人摄像头验收；最终仍需在使用现场确认右手识别、点赞、光标方向和光照效果。
