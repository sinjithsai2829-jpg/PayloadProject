import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const port = Number(process.env.PORT || 5173);
const root = process.cwd();
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json' };

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^([.][.][/\\])+/, '');
    if (path === '/' || path === '.') path = '/index.html';

    // main.js still contains a legacy CSS import. When the browser requests
    // style.css as a JavaScript module, return an empty JS module instead.
    // The real stylesheet is loaded normally from index.html via <link>.
    if (path === '/src/style.css' && req.headers['sec-fetch-dest'] === 'script') {
      res.writeHead(200, {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end('export {};\n');
      return;
    }

    const full = join(root, path);
    const info = await stat(full);
    if (!info.isFile()) throw new Error('Not a file');
    const body = await readFile(full);
    res.writeHead(200, {
      'Content-Type': `${types[extname(full)] || 'application/octet-stream'}; charset=utf-8`,
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(port, () => console.log(`PayloadDiff running at http://localhost:${port}`));
