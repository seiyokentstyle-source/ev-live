import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveIndex, LiveMachine } from "../lib/live-data";
import { validateMachine } from "../lib/ev/validate";
import { LIVE_REFRESH_MS, startLiveMachineRefresh, startLiveRefresh } from "../lib/live-refresh";
import fixture from "../app/preview/ev-table/machine.json";

const original: LiveMachine = {
  schema: "evlive-live-machine/v1",
  revision: "a".repeat(64),
  machine: validateMachine(fixture),
  savedTargets: []
};
const updated: LiveMachine = {
  ...original,
  revision: "b".repeat(64),
  machine: {
    ...original.machine,
    meta: { ...original.machine.meta, samples: "2,000" },
    profiles: original.machine.profiles.map(profile => ({
      ...profile,
      baseAnchors: profile.baseAnchors.map(anchor => ({ ...anchor, n: 2000 }))
    }))
  }
};

function indexFor(payload: LiveMachine = original): LiveIndex {
  const { id, name, manufacturer, aliases, available, thumb, releaseDate, lastUpdated, meta } = payload.machine;
  return {
    schema: "evlive-live-index/v1",
    machines: [{
      id,
      hallId: "shinjuku",
      revision: payload.revision,
      summary: { id, name, manufacturer, aliases, available, thumb, releaseDate, lastUpdated, meta }
    }]
  };
}

function response(data: unknown, ok = true): Response {
  return { ok, json: async () => data } as Response;
}

let browser: EventTarget;
let page: EventTarget & { visibilityState: string };
let request: ReturnType<typeof vi.fn<typeof fetch>>;
let stop: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-11T06:00:00Z"));
  browser = Object.assign(new EventTarget(), {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval
  });
  page = Object.assign(new EventTarget(), { visibilityState: "visible" });
  request = vi.fn<typeof fetch>();
  vi.stubGlobal("window", browser);
  vi.stubGlobal("document", page);
  vi.stubGlobal("fetch", request);
});

afterEach(() => {
  stop?.();
  stop = undefined;
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("live machine snapshots", () => {
  it("refreshes same-day sample counts and tables together, then skips unchanged details", async () => {
    request
      .mockResolvedValueOnce(response(indexFor(original)))
      .mockResolvedValueOnce(response(indexFor(updated)))
      .mockResolvedValueOnce(response(updated))
      .mockResolvedValue(response(indexFor(updated)));
    const onUpdate = vi.fn();
    stop = startLiveMachineRefresh(original, "shinjuku", onUpdate);
    await vi.advanceTimersByTimeAsync(0);
    expect(request).toHaveBeenCalledTimes(1);
    expect(onUpdate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(LIVE_REFRESH_MS);
    expect(updated.machine.lastUpdated).toBe(original.machine.lastUpdated);
    expect(onUpdate).toHaveBeenCalledOnce();
    expect(onUpdate.mock.calls[0][0]).toMatchObject({
      revision: updated.revision,
      machine: { meta: { samples: "2,000" }, lastUpdated: original.machine.lastUpdated }
    });
    expect(onUpdate.mock.calls[0][0].machine.profiles[0].baseAnchors[0].n).toBe(2000);
    expect(request.mock.calls[2][0]).toContain(`/${original.machine.id}.json?revision=${updated.revision}`);
    expect(request.mock.calls[2][1]).toMatchObject({ cache: "no-store" });

    await vi.advanceTimersByTimeAsync(LIVE_REFRESH_MS);
    expect(request).toHaveBeenCalledTimes(4);
    expect(onUpdate).toHaveBeenCalledOnce();
  });

  it("keeps the displayed snapshot when a detail request fails and retries its revision", async () => {
    request
      .mockResolvedValueOnce(response(indexFor(updated)))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(response(indexFor(updated)))
      .mockResolvedValueOnce(response(updated));
    let displayed = original;
    stop = startLiveMachineRefresh(original, "shinjuku", next => { displayed = next; });
    await vi.advanceTimersByTimeAsync(0);
    expect(displayed).toBe(original);

    await vi.advanceTimersByTimeAsync(LIVE_REFRESH_MS);
    expect(displayed.revision).toBe(updated.revision);
    expect(displayed.machine.meta.samples).toBe("2,000");
    expect(request).toHaveBeenCalledTimes(4);
  });

  it("rejects a detail from a different deployment without accepting its revision", async () => {
    request
      .mockResolvedValueOnce(response(indexFor(updated)))
      .mockResolvedValueOnce(response(original))
      .mockResolvedValueOnce(response(indexFor(updated)))
      .mockResolvedValueOnce(response(updated));
    const onUpdate = vi.fn();
    stop = startLiveMachineRefresh(original, "shinjuku", onUpdate);
    await vi.advanceTimersByTimeAsync(0);
    expect(onUpdate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(LIVE_REFRESH_MS);
    expect(onUpdate).toHaveBeenCalledOnce();
    expect(onUpdate.mock.calls[0][0].revision).toBe(updated.revision);
  });

  it("does not load a different hall's matching machine", async () => {
    request.mockResolvedValue(response(indexFor(updated)));
    const onUpdate = vi.fn();
    stop = startLiveMachineRefresh(original, "akihabara", onUpdate);
    await vi.advanceTimersByTimeAsync(0);
    expect(request).toHaveBeenCalledOnce();
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

describe("live refresh lifecycle", () => {
  it.each(["focus", "online", "pageshow", "visibilitychange"])("checks again when %s returns the user to live data", async event => {
    request.mockResolvedValue(response(indexFor()));
    const onIndex = vi.fn();
    stop = startLiveRefresh(onIndex);
    await vi.advanceTimersByTimeAsync(0);
    expect(onIndex).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(5_001);
    (event === "visibilitychange" ? page : browser).dispatchEvent(new Event(event));
    await vi.advanceTimersByTimeAsync(0);
    expect(request).toHaveBeenCalledTimes(2);
    expect(onIndex).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][0]).not.toBe(request.mock.calls[1][0]);
    expect(request.mock.calls[1][1]).toMatchObject({ cache: "no-store" });
  });

  it("does not request while hidden and resumes immediately when visible", async () => {
    request.mockResolvedValue(response(indexFor()));
    page.visibilityState = "hidden";
    const onIndex = vi.fn();
    stop = startLiveRefresh(onIndex);
    await vi.advanceTimersByTimeAsync(LIVE_REFRESH_MS * 2);
    browser.dispatchEvent(new Event("focus"));
    expect(request).not.toHaveBeenCalled();

    page.visibilityState = "visible";
    page.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(request).toHaveBeenCalledOnce();
    expect(onIndex).toHaveBeenCalledOnce();

    page.visibilityState = "hidden";
    page.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(LIVE_REFRESH_MS * 2);
    expect(request).toHaveBeenCalledOnce();
  });

  it.each([
    ["network", () => Promise.reject(new Error("offline"))],
    ["HTTP", () => Promise.resolve(response(null, false))],
    ["invalid index", () => Promise.resolve(response({ schema: "evlive-live-index/v1", machines: [{}] }))]
  ])("keeps the last index after a %s failure and retries", async (_reason, failure) => {
    request.mockImplementationOnce(failure).mockResolvedValue(response(indexFor()));
    const onIndex = vi.fn();
    stop = startLiveRefresh(onIndex);
    await vi.advanceTimersByTimeAsync(0);
    expect(onIndex).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(LIVE_REFRESH_MS);
    expect(onIndex).toHaveBeenCalledOnce();
  });

  it("coalesces repeated lifecycle events and does not overlap an in-flight request", async () => {
    let resolveRequest!: (value: Response) => void;
    request.mockImplementationOnce(() => new Promise(resolve => { resolveRequest = resolve; }));
    stop = startLiveRefresh(vi.fn());
    browser.dispatchEvent(new Event("focus"));
    browser.dispatchEvent(new Event("pageshow"));
    await vi.advanceTimersByTimeAsync(6_000);
    browser.dispatchEvent(new Event("online"));
    expect(request).toHaveBeenCalledOnce();
    resolveRequest(response(indexFor()));
    await vi.advanceTimersByTimeAsync(0);
  });

  it("aborts an active request and ignores late results and events after cleanup", async () => {
    let resolveRequest!: (value: Response) => void;
    request.mockImplementationOnce(() => new Promise(resolve => { resolveRequest = resolve; }));
    const onIndex = vi.fn();
    stop = startLiveRefresh(onIndex);
    const signal = request.mock.calls[0][1]?.signal;
    stop();
    expect(signal?.aborted).toBe(true);
    resolveRequest(response(indexFor()));
    await vi.advanceTimersByTimeAsync(0);
    expect(onIndex).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);

    for (const event of ["focus", "online", "pageshow"]) browser.dispatchEvent(new Event(event));
    page.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(LIVE_REFRESH_MS * 2);
    expect(request).toHaveBeenCalledOnce();
  });
});
