import { rm, mkdir, cp, readFile, writeFile } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/src', { recursive: true });
await cp('index.html', 'dist/index.html');
await cp('src', 'dist/src', { recursive: true });

// Static hosts cannot import CSS as a JavaScript module. The stylesheet is
// already linked from index.html, so strip the legacy import from main.js.
const mainPath = 'dist/src/main.js';
const main = await readFile(mainPath, 'utf8');
await writeFile(mainPath, main.replace("import './style.css';\n\n", ''), 'utf8');

console.log('Static production files created in dist/');
