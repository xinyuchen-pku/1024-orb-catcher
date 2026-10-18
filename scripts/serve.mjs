import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
const root = fileURLToPath(new URL('../dist/',import.meta.url));
const mime = {'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.wasm':'application/wasm','.task':'application/octet-stream'};
createServer(async(req,res)=>{
  try {
    const url = new URL(req.url,'http://localhost');
    const path = resolve(root,'.'+decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!path.startsWith(resolve(root)+sep)) {res.writeHead(403).end(); return;}
    const content = await readFile(path); res.writeHead(200,{'Content-Type':mime[extname(path)] || 'application/octet-stream'});res.end(content);
  } catch {res.writeHead(404).end('Not found');}
}).listen(5174,'127.0.0.1',()=>console.log('星球捕手：http://127.0.0.1:5174/\n演示：http://127.0.0.1:5174/?demo=1\n按 Ctrl+C 关闭。'));
