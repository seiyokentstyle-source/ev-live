# scraper

データ生成スクリプト置き場（サイトとは独立）。現在は外部リポジトリ `777site-scraper`
が担っており、ここへ統合予定。

## 契約（このスクリプトが満たすこと）
- 出力先: リポジトリ root の `data/machines/*.json`（サイトはこれを読むだけ）。
- 各機種 JSON は `site/lib/ev/validate.ts` の `validateMachine` を通る形であること。
- `baseAnchors` の各要素: `{ g, ev, rtp, n? }`
  - `g`   現在G（AT間機種は AT・RB 間ハマりG）
  - `ev`  期待値（円）
  - `rtp` 機械割（%）。不変条件 `(rtp>=100) == (ev>=0)` を維持。
  - `n`   そのGの推定に使ったサンプル数（任意）。

## 実行（統合後の想定）
`.github/workflows/scrape.yml` が `schedule`（毎晩）＋ `workflow_dispatch`（手動）で
このスクリプトを実行し、`data/machines/*.json` を更新して commit/push する。
push を `nextjs.yml` が検知してサイトを再デプロイする。
