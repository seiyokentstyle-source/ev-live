import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import fixture from "../app/preview/ev-table/machine.json";
import { validateMachine } from "../lib/ev/validate";
import { MachineDetailClient } from "../app/machines/[id]/MachineDetailClient";
import { ConditionsBar } from "../components/ev/ConditionsBar";
import { aimModeLabel } from "../components/ev/ModeSelector";
import { HALLS } from "../lib/halls";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const hall = HALLS.find(item => item.id === "shinjuku")!;

// 2026-11-10 利用者指定：算出条件は目的行の右端の開閉ボタンではなく、目的の1ページにする。
describe("算出条件は目的の1ページ", () => {
  it("目的の行に算出条件のタブがあり、右端の開閉ボタンは無い", () => {
    const machine = validateMachine(structuredClone(fixture));
    const html = renderToStaticMarkup(<MachineDetailClient machine={machine} hall={hall} />);
    expect(html).toContain("目的");
    expect(html).toContain("算出条件");
    expect(html).toContain("計算の前提");
    expect(html).not.toContain("算出条件 ▼");
    expect(aimModeLabel("conditions")).toBe("算出条件");
    expect(aimModeLabel("ev")).toBe("期待値稼働");
  });

  it("ページとして出すときは表のスクロールで畳まれる行にしない", () => {
    const machine = validateMachine(structuredClone(fixture));
    const page = renderToStaticMarkup(<ConditionsBar asPage detailsOnly expanded machine={machine} mode="ev" />);
    const bar = renderToStaticMarkup(<ConditionsBar detailsOnly expanded machine={machine} mode="ev" />);
    expect(page).not.toContain("collapsible-bar");
    expect(bar).toContain("collapsible-bar");
    expect(page).toContain("時給換算");
    // 箇条書き（2026-11-10 利用者指定）。開閉の行は従来どおり項目と値の2列。
    expect(page).toContain("<ul");
    expect(page).toContain("<li");
    expect(page).not.toContain("<dl");
    expect(bar).toContain("<dl");
  });
});
