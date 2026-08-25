# EV Live

パチスロ期待値の**データ中心**リポジトリ。主役は `data/machines/**/*.json` で、
表示用の Next.js サイトは従属物として `site/` に置いている。

公開先: <https://seiyokentstyle-source.github.io/ev-live/>

## 構成

```
data/machines/*.json          期待値データ（外部の 777site-scraper が生成・上書き）
data/machines/<店舗id>/*.json 店舗別のデータ
site/                         表示用 Next.js。ビルド/テスト/設定は全てこの下で完結
scripts/                      データの巻き戻りチェック
docs/                         データの契約
.github/workflows/
├─ nextjs.yml                 site/ をビルドして GitHub Pages へデプロイ
├─ site-test.yml              テストと本番相当ビルド
└─ data-guard.yml             データの巻き戻りを止める
```

## 画面の流れ

```
機種一覧  →  店舗選択  →  期待値稼働 / 設定狙い / AT獲得
/machines    /machines/<機種id>    /machines/<機種id>/<店舗id>
```

店舗はサイト側の `site/lib/halls.ts` で定義する。データ未収集の店舗は
「準備中」を出し、**他店のデータを代わりに見せることはしない**
（店舗ごとに設定配分が違うため、そのまま当てはめると期待値の判断を誤る）。

## ドキュメントの読み分け

| 知りたいこと | 見る場所 |
|---|---|
| このリポジトリで守ること、データの扱い | **[CLAUDE.md](CLAUDE.md)** |
| 生成されるJSONが満たすべき形 | **[docs/data-contract.md](docs/data-contract.md)** |
| 収集の仕組み・計算式・機種スペック | 外部リポジトリ `777site-scraper` の `仕様.md` |

## 開発

```bash
cd site
npm install
npm run dev          # http://localhost:3000/
npm test             # vitest
```

本番相当の静的書き出し:

```bash
cd site
PAGES_BASE_PATH=/ev-live STATIC_EXPORT=true npm run build   # → site/out
```

データを触るブランチでは、マージ前に巻き戻りが無いか確認する:

```bash
node scripts/check-data-regression.mjs
```
