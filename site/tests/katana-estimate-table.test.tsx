import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { KatanaEstimateTable } from "../components/ev/KatanaEstimateTable";
import { ModeSelector } from "../components/ev/ModeSelector";
import { katanaEstimateFixture, unavailableKatanaEstimateFixture } from "./fixtures/katana-estimate";

function render(data = katanaEstimateFixture(), highState = false) {
  return renderToStaticMarkup(<KatanaEstimateTable data={data} highState={highState} onHighStateChange={vi.fn()} />);
}

describe("刀ポイント参考試算の表示", () => {
  it("公開された9ポイント×3色を表示し、校正条件と回収の母数を併記する", () => {
    const html = render();
    expect((html.match(/<tr>/g) ?? [])).toHaveLength(10);
    for (const label of ["0pt", "80pt", "青", "黄", "赤", "設定未調整の参考試算", "20円等価", "AT終了即やめ",
      "300.0枚", "n=2件", "2026-09-01", "2026-09-03", "回収相当率p", "577.08枚", "実測AT当選率ではありません"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("合成テスト版");
    expect(html).toContain("未観測獲得の件数と金額影響は未確定");
    expect(html).toContain('href="https://example.com/synthetic-katana-source"');
  });

  it("高確切替は対応する公開行を選び、フロントで値を作り直さない", () => {
    const normal = render();
    const high = render(katanaEstimateFixture(), true);
    expect(normal).toContain("斬高確なし・20円等価");
    expect(high).toContain("斬高確あり・20円等価");
    expect(normal).toContain("-200円");
    expect(high).toContain("-190円");
    expect(high).not.toContain(">-200円</span>");
  });

  it("新しい平均・期間・件数・結果を同じpayloadから同時に表示する", () => {
    const data = katanaEstimateFixture();
    if (!data.ready) throw new Error("ready fixture required");
    data.sample = { count: 3, totalPayout: 1200, meanPayout: 400, meanAtGames: 133.33333333333334 };
    data.source.periodEnd = "2026-09-04";
    data.rows[0] = { ...data.rows[0], evYen: 12345, rtpPct: 123.4, hourlyYen: 9876 };
    const html = render(data);
    expect(html).toContain("400.0枚");
    expect(html).toContain("n=3件");
    expect(html).toContain("2026-09-04");
    expect(html).toContain("12,345円");
    expect(html).toContain("123.4%");
    expect(html).toContain("時給 9,876円");
    expect(html).not.toContain("300.0枚");
  });

  it("0件は未算出として表示し、平均0や前の表を表示しない", () => {
    const html = render(unavailableKatanaEstimateFixture());
    expect(html).toContain("対象サンプルなし");
    expect(html).toContain("n=0件");
    expect(html).toContain("<strong>—</strong>");
    expect(html).not.toContain("<table");
    expect(html).not.toContain("300.0枚");
    expect(html).not.toContain("0.0枚");
  });

  it("対応目的としてだけ刀ポイントタブを追加する", () => {
    const present = renderToStaticMarkup(<ModeSelector value="katana" onChange={vi.fn()} modes={["ev", "katana"]} />);
    const absent = renderToStaticMarkup(<ModeSelector value="ev" onChange={vi.fn()} modes={["ev"]} />);
    expect(present).toContain("刀ポイント");
    expect(absent).not.toContain("刀ポイント");
  });
});
