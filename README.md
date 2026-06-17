# EV Live

EV Live is a **data-centric** repository for Japanese pachislot expected-value data.
The data (`data/machines/*.json`) is the core; the mobile-first Next.js viewer is a
secondary piece that lives under `site/`.

Source spec: Notion `EV Live - 開発仕様書 v1.4`.

## Layout

- `data/machines/*.json` — expected-value data (generated/overwritten by the scraper).
- `scraper/` — data-generation script (kept separate from the site). _planned_
- `site/` — Next.js viewer. All site build/test/config lives here.
- `.github/workflows/nextjs.yml` — builds `site/` and deploys to GitHub Pages.

## Phase 1 Scope

- Machine list at `/machines`
- Machine detail / EV table at `/machines/[id]`
- JSON-driven machine data
- Four strategy profiles
- Four table metrics: RTP, EV, hourly EV, average medals
- Pivot columns for comparing select-axis EV values
- Favorite machines via `localStorage`

## Development

```bash
cd site
npm install
npm run dev
```

Open `http://localhost:3000/`.

Production-equivalent static export:

```bash
cd site
PAGES_BASE_PATH=/ev-live STATIC_EXPORT=true npm run build   # → site/out
```
