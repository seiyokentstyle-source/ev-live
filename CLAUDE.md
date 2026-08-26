# ev-live

パチスロ期待値の**データ中心**リポジトリ。主役は `data/machines/*.json`（スクレイパー生成物）。
表示用の Next.js サイトは従属物として `site/` に置き、GitHub Pages のプロジェクトページ
（basePath=`/ev-live`）として公開する。

## リポジトリ構成（データ中心）
- `data/machines/*.json` … 主役。期待値データ（スクレイパーが毎晩生成・上書き）。
  店舗別は `data/machines/<店舗id>/`。生成側は外部リポジトリ `777site-scraper`。
- `site/` … 表示用 Next.js（おまけ）。ビルド/テスト/設定は全て `site/` 配下で完結。
- `docs/data-contract.md` … 生成されるJSONが満たすべき形（サイト側からの契約）。
- `.github/workflows/nextjs.yml` … `site/` をビルドして Pages へデプロイ。
- `.github/workflows/data-guard.yml` … データの巻き戻りを止める（下記）。
- `scripts/check-data-regression.mjs` … 同上の実体。ローカルでも走らせられる。

## UIを見せるとき（重要）
ユーザーにUIを見せる・確認してもらうときは、**ローカルの dev サーバ起動手順やスクショではなく、
公開中のライブURLを案内する**こと:

- トップ（機種一覧）: https://seiyokentstyle-source.github.io/ev-live/
- 店舗選択: https://seiyokentstyle-source.github.io/ev-live/machines/<機種id>/ （例: `.../machines/hokuto/`）
- 期待値表: https://seiyokentstyle-source.github.io/ev-live/machines/<機種id>/<店舗id>/ （例: `.../machines/hokuto/shinjuku/`）

画面の流れは 機種一覧 → 店舗選択 → 期待値稼働/設定狙い/AT獲得。店舗は `site/lib/halls.ts`
で定義し、未収集の店舗は「準備中」を出す（他店のデータを代わりに見せない）。

注意: ライブサイトは `main` ブランチのデプロイ結果。PR の変更を実機で見せたい場合はマージ後に反映される。

## データは巻き戻さない（重要）
`data/machines/**/*.json` は毎晩の収集で**前へ進むだけ**の資産。後ろへ動くことはない。
古い土台で再生成したJSONを新しい `main` へマージすると、1日ぶんが黙って消える
（実際に一度、8/22のCSVから作ったJSONを8/23ぶんが入った `main` へマージしかけた）。

**ブランチで作業して `main` が進んでいたら、データは `main` 側を採用してコードの変更だけ残すこと:**
```
git fetch origin main
git checkout origin/main -- data/machines
```
`make_evlive_data.py` の「大幅減なら上書きしない」ガードは再生成時にしか効かず、
gitのマージは素通りする。そのため `data-guard` workflow が PR と `main` への push で
`scripts/check-data-regression.mjs` を走らせて止める。手元でも確認できる:
```
node scripts/check-data-regression.mjs
```
- `lastUpdated` が古くなったら**必ず失敗**（意図して古くする場面が無いため、合図でも通さない）
- 件数の1割超の減少・機種JSONの消失は、コミットメッセージに `[allow-data-regression]` が
  あれば通る（スペック変更で正しく減る／獲得データ不良の機種を外した場合）

## 並行作業のルール ★重要
このリポジトリは**同時に3者が書く**。競合させないこと。

1. **収集PC**（`seiyokentstyle-source`）… 生成した機種JSONを `main` へ直接pushする
   （`data: update <機種> <日付>`）。収集中は15分おきに来る。止まらない
2. **Codex** … 別途作業している。担当範囲が重なる可能性がある
3. **Claude Code**

守ること:
- **push の直前に必ず `git pull --rebase origin main`**。収集PCのpushと必ず競合する
- **作業単位を小さく、こまめにpush**。ローカルに長時間ためない
- **`force push` しない**。他の2者の作業を消す
- **触る前に `git log --format='%h %ad %an %s' -15 origin/main` で直近の変更を見る**
- `data/machines/**` はスクレイパーの生成物。**サイト側の作業では絶対に触らない**
- 生成側（`777site-scraper`）と両方直す変更は、**先にスクレイパー側をpush**してから
  サイト側を出す（サイトだけ先に出ても、データが来るまで表示が変わらないため）

## 公開が止まる仕組み（覚えておく）
`nextjs.yml` は公開前に `scripts/check-data-regression.mjs` を通す。
**データが巻き戻っていたらデプロイしない**（2026-08-26 に5機種で14〜26%減ったJSONが
data-guard 5連続failureのまま公開されたため入れた）。
サイトが更新されないときは、まずこのステップが赤くなっていないか見ること。

## 文言はサイト側で言い換えられる（データ再生成を待たない）
軸やプロファイルの見出しはデータ側（`evFilters.axes` / `profile.label`）が配るので、
生成側だけ直しても夜間の再生成まで古い文言が出続ける。
`site/lib/ev/profiles.ts` の `LABEL_REWRITES` / `AXIS_LABEL_REWRITES` を通せば即時に反映される。
**数値はデータが正・文言はサイトが正**、という役割分担。

## 制約
- `data/machines/*.json` は編集しない（スクレイパーが毎晩上書きする）。表示の都合はサイト側で吸収する。
- `site/lib/ev/validate.ts` のバリデーションを壊さない。
- `site/tests/`（vitest）が通ること。テストはスクレイプ値に依存しない形で書く。
- データはリポジトリ root の `data/`、サイトは `site/`。`site/lib/machines.ts` は root の `data/` を解決して読む。
- 公開は静的書き出し（`site/` で `next build` → `site/out/`）。basePath / `output: export` は
  デプロイ workflow が env（`PAGES_BASE_PATH=/ev-live` / `STATIC_EXPORT=true`）で注入し、
  `next.config.mjs` が読む。ローカル `next dev` は env 未設定で `/` で動く。

## よく使うコマンド（すべて `site/` で）
- 開発: `cd site && npm run dev`
- テスト: `cd site && npm test`
- 本番相当ビルド: `cd site && PAGES_BASE_PATH=/ev-live STATIC_EXPORT=true npm run build`
