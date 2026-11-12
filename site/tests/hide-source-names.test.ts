import { describe, expect, it } from 'vitest';
import fixture from '../app/preview/ev-table/machine.json';
import { hideSourceNamesInText, normalizeMachineMetadata } from '../lib/machine-metadata';
import { validateMachine } from '../lib/ev/validate';
import { HALLS } from '../lib/halls';

// 利用者指定（2026-11-13）：算出条件には店の名前と取得元サイトの名前を書かない。
const FORBIDDEN = /歌舞伎|東宝|アイランド|萌えスロ|エスパス|池袋|プレゴ|上野|西武|渋谷|秋葉原|サイトセブン|台データ|Daidata|Site ?Seven|新宿/;

// 2026-11-12 時点で公開済みのJSONにあった文（そのままの写し）。
const PUBLISHED = [
  '台データオンライン（エスパス日拓新宿歌舞伎町店）だけにある機種で、履歴は取り込み始めたところです。台データの種別（BB/RB/ART等）と実機のボーナス・AT・CZの対応、連チャンの区切りを実データで確かめるまで、期待値の算出を保留しています。',
  '機械割97.6%／設定1機械割97.6%（公表値: slobase / chonborista）。サイトセブンのBB（AT）獲得が約45%欠けるため、この機械割と実測の初当りG分布から1回あたりの獲得を逆算している',
  '信号はCZ・AT中のスナイパーチャンスで上がり、当選G数にはAT中のGも入る。東宝・アイランドはグラフのある日はグラフが上がった区間をAT、台データの店は差枚の記録で判定できる連なりはそれで決める。AT間のG数はデータカウンターの当選G数の合計',
  '信号確認済み店舗のRBを初当り、ARTをST中ボーナスとして一連に合算する参考集計。歌舞伎町・西武新宿・上野新館は0GのART、秋葉原は正Gを含むARTを用いる。',
  '台データの信号。BB＝ボーナス、ART＝SJ（AT）。',
  '台データの信号。RB＝CZ、RBの直後のART（スマートプレゴはBB）＝CZ成功のAT当選。ARTとBBが同じ台日に混ざる店（西武新宿）は信号の割り当てが違うので集計しない。',
  '歌舞伎町のBBをBC、ARTをBT系信号として、3G以内の継続を合算する参考集計。',
  '歌舞伎町のRBをCZ、直後1GのBBをAT初当りとし、次のRBまでのBBを同一ATに合算。',
  '台データの信号。ART（池袋はBB）がボーナス、5G以内に続くARTはRUSH中の続き。',
  'ボーナス・AT間900G+αでAT。実測の最深は967G。ATの獲得は台データの差枚から見積もった値',
  'BB＝ボーナス、ART（池袋はRB）＝ATの1セット。台データの差枚から見積もった1セットあたりの枚数（続き+108枚・初当り+128枚）を足している。',
  '新宿のBB・RBを疑似ボーナスとして、各ボーナス後に毎回7G確認する機械的な参考条件。',
  '歌舞伎町のARTをGB系初当りとして0〜1Gの継続信号を合算する参考集計。',
  '2026-10-05導入の新台で、履歴は取り込み始めたところです。台データの種別（BB/RB/ART等）と実機のボーナス・AT・CZの対応、連チャンの区切りを実データで確かめるまで、期待値の算出を保留しています。',
];

describe('算出条件に店名・取得元サイト名を出さない', () => {
  it('公開済みの文から店名・サイト名が消える', () => {
    for (const text of PUBLISHED) {
      const shown = hideSourceNamesInText(text);
      expect(shown, text).not.toMatch(FORBIDDEN);
      expect(shown.length).toBeGreaterThan(10);
    }
  });

  it('名前を含まない文と数値は変えない', () => {
    const text = '当たり後32G（この分の投資を毎セッションに計上）';
    expect(hideSourceNamesInText(text)).toBe(text);
  });

  it('機種データの算出条件と保留理由の両方に効く', () => {
    const machine = validateMachine(structuredClone(fixture));
    const withNames = {
      ...machine,
      calcSpec: { items: [{ k: '履歴信号の解釈', v: PUBLISHED[7] }, { k: '賭け枚数', v: '3枚掛け' }] },
      profiles: machine.profiles.map((profile, index) => index === 0
        ? { ...profile, pendingReason: PUBLISHED[13] } : profile),
    };
    const shown = normalizeMachineMetadata(withNames);
    expect(shown.calcSpec?.items[0].v).toBe('RBをCZ、直後1GのBBをAT初当りとし、次のRBまでのBBを同一ATに合算。');
    expect(shown.calcSpec?.items[1].v).toBe('3枚掛け');
    expect(shown.profiles[0].pendingReason).not.toMatch(FORBIDDEN);
    expect(shown.profiles.slice(1)).toEqual(withNames.profiles.slice(1));
  });
});

// 利用者指定（2026-11-13）：出典もいらない／算出条件以外も店名をそのまま出さない。
describe('出典と、算出条件以外の店名・取得元名を出さない', () => {
  it('公表値の出典名を落とす', () => {
    expect(hideSourceNamesInText('機械割97.6%／設定1機械割97.6%（公表値: slobase / chonborista）。'))
      .toBe('機械割97.6%／設定1機械割97.6%（公表値）。');
  });

  it('仕様出典の項目をページのデータから外し、集計元の一覧も伏せる', () => {
    const base = validateMachine(structuredClone(fixture));
    const machine = normalizeMachineMetadata({
      ...base,
      meta: { ...base.meta, source: '実戦データ自動収集（店舗混合（新宿 ゴジラのお店 / 池袋 スマートプレゴ池袋））' },
      calcSpec: { title: '算出条件', items: [
        { k: '天井', v: '999G' },
        { k: '仕様出典', v: 'https://example.invalid/a / https://example.invalid/b' },
      ] },
    });
    expect(machine.calcSpec?.items).toEqual([{ k: '天井', v: '999G' }]);
    expect(machine.meta.source).toBe('実戦データ自動収集（店舗混合（新宿 ゴジラのお店 / 池袋 池袋のお店））');
    expect(JSON.stringify(machine)).not.toContain('example.invalid');
  });

  it('保留理由と店舗の補足から取得元名が消える', () => {
    expect(hideSourceNamesInText('対象日の台データを取り切ったことを確認できないため、期待値は算出保留です。')).not.toMatch(/台データ/);
    expect(JSON.stringify(HALLS)).not.toMatch(/Daidata|台データ|サイトセブン|エスパス|アイランド|東宝|プレゴ/);
  });
});
