import { describe, it, expect } from "vitest";
import { rewriteAxisLabel } from "../lib/ev/profiles";

describe("軸の見出しの言い換え", () => {
  it("つく日は特定日にする", () => {
    expect(rewriteAxisLabel("つく日")).toBe("特定日");
  });
  it("選択肢の文言は変えない", () => {
    expect(rewriteAxisLabel("3のつく日")).toBe("3のつく日");
  });
  it("他の軸はそのまま", () => {
    for (const l of ["末尾", "道中CZ", "RBスルー", "前回AT", "前回連チャン"]) {
      expect(rewriteAxisLabel(l)).toBe(l);
    }
  });
});
