# Implementation Notes

This project follows the Notion spec `EV Live - 開発仕様書 v1.4`.

Implemented Phase 1 areas:

- `/machines`: machine list, search normalization, maker filter, favorites.
- `/machines/[id]`: EV table, 14-axis conditions, bottom-sheet pickers, pivot columns.
- JSON-driven machine data in `data/machines/vvv2.json`.
- Pure EV calculation functions in `lib/ev/calc.ts`.
- Machine data validation in `lib/ev/validate.ts`.

Deliberate MVP limits:

- Supabase Auth and Stripe are not wired yet.
- PWA manifest exists, but offline service-worker caching is still pending.
- The CZ/CZ-like 999G profiles include a final `999G` row in addition to 5G increments so the listed ceiling zone is visible.
