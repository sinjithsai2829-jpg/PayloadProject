# PayloadDiff v0.1

A private, ad-free JSON/XML formatter and side-by-side comparison tool designed for very large payloads.

## Current features

- JSON ↔ JSON and XML ↔ XML modes only.
- Two side-by-side panes: File 1 and File 2.
- Paste or upload `.json`, `.xml`, or `.txt` payloads.
- Flexible JSON cleanup for commonly escaped payloads such as `\"key\"` / multiple escaping layers.
- XML cleanup for escaped attribute quotes.
- JSON formatting and XML formatting/validation.
- JSON Tree View with lazy branch expansion/collapse.
- JSON structural comparison by path (not simple line order).
- Difference navigation that expands the JSON tree to the changed path.
- XML line comparison runs inside a Web Worker.
- No backend, no database, no payload upload.

## Performance design

The parser/formatter/comparison work runs in a Web Worker so the main browser UI remains responsive. The JSON tree is rendered lazily: collapsed branches do not create DOM rows until expanded. This is important for 50,000+ line payloads.

The first version caps stored/navigable differences at 20,000 to avoid runaway browser memory usage on extremely different payloads. The summary still reports whether navigation was truncated.

## Run locally

```bash
npm install
npm run dev
```

Then open the local Vite URL shown in the terminal.

## Production build

```bash
npm run build
```

The deployable static site is generated in `dist/` and can be hosted on Cloudflare Pages, Netlify, Vercel, GitHub Pages, or any static web server.

## Next performance/features milestone

- Virtualized code/diff renderer (only visible lines in the DOM).
- Worker-side searchable JSON path index.
- Ignore selected JSON paths/keys (timestamps, request IDs, etc.).
- Optional synchronized tree expansion between File 1 and File 2.
- Smarter array comparison by a selected key rather than index only.
