#!/bin/zsh
cd -- "${0:A:h}"
if command -v python3 >/dev/null 2>&1; then
  python3 serve.py
elif command -v node >/dev/null 2>&1; then
  node scripts/serve.mjs
else
  echo '请先安装 Python 3 或 Node.js，再启动游戏。'
  read -r '?按回车关闭'
fi
