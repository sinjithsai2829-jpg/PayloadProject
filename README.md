# PayloadDiff v0.2

A private, ad-free JSON/XML formatter and side-by-side comparison tool designed for very large payloads.

## Current features

- JSON ↔ JSON and XML ↔ XML modes only.
- Two side-by-side panes: File 1 and File 2.
- Paste or upload `.json`, `.xml`, or `.txt` payloads.
- Flexible JSON cleanup for commonly escaped payloads such as `\"key\"` and multiple escaping layers.
- XML cleanup for escaped attribute quotes.
- JSON formatting and XML formatting/validation.
- JSON Tree View with lazy branch expansion/collapse.
- Worker-based JSON Tree search by key, JSON path, or primitive value.
- Optional synchronized tree navigation between File 1 and File 2.
- JSON structural comparison by path rather than simple line order.
- Difference navigation that expands the JSON tree to the changed path.
- XML line comparison in a Web Worker.
- Virtualized formatted Code View: only visible lines plus a small overscan window are rendered in the DOM.
- No backend, no database, no payload upload.

## Performance design

Formatting and comparison already run in a Web Worker. JSON tree search now also runs in a dedicated worker so searching a very large parsed payload does not block the main UI.

The formatted Code View uses fixed-height virtualization. A 50,000–100,000+ line payload can be held as text while only the lines near the current scroll position are represented by DOM rows.

The JSON tree remains lazy. Collapsed branches do not create child rows until expanded, and large arrays/objects load children in pages of 250.

Comparison navigation is capped at 20,000 stored differences to avoid runaway browser memory usage when two extremely large payloads are almost completely different.

## Run locally

```bash
npm install
npm run dev
```

Then open the local URL shown in the terminal.

## Tests

```bash
npm test
```

The test suite includes escaped JSON/XML handling, JSON/XML comparison, JSON tree search, and a generated JSON payload that formats to roughly 100,000 lines.

## Production build

```bash
npm run build
```

The deployable static site is generated in `dist/` and can be hosted on Cloudflare Pages, Netlify, Vercel, GitHub Pages, or any static web server.

## Next milestone

- Ignore selected JSON paths/keys such as timestamps, request IDs, and session IDs.
- Smarter array comparison by a selected identity key instead of array position only.
- JSON Code View path-to-line highlighting so structural changes can also be shown directly in virtualized code.
- Additional stress testing with real-world multi-megabyte payloads.
