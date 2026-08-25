# データの契約

`data/machines/**/*.json` は外部リポジトリ **`777site-scraper`** の
`make_evlive_data.py` が生成する。サイトはこれを読むだけで、書き換えない。
この文書は「生成側が満たすべき形」をサイト側から示したもの。

## 置き場

```
data/machines/*.json              既定店舗（新宿）
data/machines/<店舗id>/*.json     他店。店舗idは site/lib/halls.ts と揃える
```

店舗idは生成側の `halls.py` の「データ小分け」と同じ値にすること。
ズレると、サイトには店舗が出るのにデータが無い状態になり、しかも黙って
空表示になるので気づきにくい。

## 各JSONが満たすこと

- `site/lib/ev/validate.ts` の `validateMachine` を通る形であること
- `baseAnchors` の各要素は `{ g, ev, rtp, n? }`

| キー | 意味 |
|---|---|
| `g` | 現在G（AT間機種は AT・RB 間のハマりG） |
| `ev` | 期待値（円） |
| `rtp` | 機械割（%）。**不変条件 `(rtp >= 100) == (ev >= 0)` を必ず維持する** |
| `n` | そのGの推定に使ったサンプル数（任意） |

`rtp` と `ev` の符号がねじれると、表で「機械割100%超なのに期待値マイナス」という
あり得ない行が出る。生成側で丸めた結果ねじれることがあるので、そこは寄せてから出す。

## 巻き戻さないこと

期待値データは毎晩の収集で前へ進むだけの資産で、後ろへは動かない。
古い土台で再生成したJSONを新しい `main` へマージすると1日ぶんが黙って消えるため、
`data-guard` workflow が PR と `main` への push で止める。
詳しくは [CLAUDE.md の「データは巻き戻さない」](../CLAUDE.md) を参照。

## 更新の流れ（現在）

収集PCで `collect_and_push.bat` が動き、収集 → 期待値表の生成 → この
リポジトリへ commit/push まで行う。push を `nextjs.yml` が検知してサイトを再デプロイする。

将来このリポジトリへ生成スクリプトを統合する場合は、`.github/workflows/` に
`schedule`＋`workflow_dispatch` のジョブを置いて同じことをさせる想定。
