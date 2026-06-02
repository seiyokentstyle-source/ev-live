# EV Live

EV Live is a mobile-first expected-value checker for Japanese pachislot play.

Source spec: Notion `EV Live - 開発仕様書 v1.4`.

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
npm install
npm run dev
```

Open `http://localhost:3000/machines`.
