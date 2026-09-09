# PayloadDiff v0.2

A private, ad-free JSON/XML formatter and side-by-side comparison tool designed for very large payloads.

## Core purpose

PayloadDiff does one thing well: compare two payloads and clearly show the differences.

- JSON ↔ JSON only.
- XML ↔ XML only.
- File 1 on the left and File 2 on the right.
- Paste or upload `.json`, `.xml`, or `.txt` payloads.
- Preserve the original pasted/uploaded source text.
- Formatting is only a working/display representation and does not replace the original source.
- JSON Tree View with lazy branch expansion/collapse.
- JSON Tree search by key, JSON path, or primitive value.
- Optional synchronized tree navigation between File 1 and File 2.
- JSON structural comparison by path.
- XML line comparison.
- Added, removed, and modified differences are reported.
- Previous/Next difference navigation.
- Virtualized formatted Code View for very large payloads.
- No backend, no database, no payload upload, no advertisements.

## Non-destructive behavior

PayloadDiff should never intentionally change business data. The original text entered by the user remains available exactly as pasted or uploaded. When formatting is needed for readability, tree navigation, or comparison, the application creates a separate working representation and then restores the original editor content.

## Performance design

Formatting and comparison run in a Web Worker so large payload processing does not block the main browser UI.

JSON tree search also runs in a dedicated worker. The formatted Code View uses fixed-height virtualization, so a 50,000–100,000+ line payload can be held as text while only the lines near the current scroll position are represented by DOM rows.

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

The test suite includes JSON/XML formatting and comparison, JSON tree search, and a generated JSON payload that formats to roughly 100,000 lines.

## Production build

```bash
npm run build
```

The deployable static site is generated in `dist/` and can be hosted on Cloudflare Pages, Netlify, Vercel, GitHub Pages, or any static web server.

## Product rule

Keep the tool focused. Do not add ignore-field rules, business-specific transformations, or automatic data changes unless explicitly requested later.
