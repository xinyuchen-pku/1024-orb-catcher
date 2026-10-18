#!/usr/bin/env python3
"""Serve the bundled production build on localhost, without third-party packages."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse

parser = argparse.ArgumentParser(description='星球捕手本地服务')
parser.add_argument('--port', type=int, default=5174)
args = parser.parse_args()
root = Path(__file__).resolve().parent / 'dist'
if not (root / 'index.html').exists():
    raise SystemExit('缺少 dist/index.html，请先运行 npm run build 或重新解压完整包。')
handler = partial(SimpleHTTPRequestHandler, directory=str(root))
try:
    server = ThreadingHTTPServer(('127.0.0.1', args.port), handler)
except OSError as error:
    raise SystemExit(f'端口 {args.port} 不可用，请通过 --port 5175 指定其他端口。{error}')
print(f'星球捕手已就绪：http://127.0.0.1:{args.port}/\n演示：http://127.0.0.1:{args.port}/?demo=1\n按 Ctrl+C 关闭。', flush=True)
try:
    server.serve_forever()
except KeyboardInterrupt:
    server.server_close()
