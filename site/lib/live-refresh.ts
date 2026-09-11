import type { LiveIndex, LiveMachine } from "./live-data";
import { validateMachine } from "./ev/validate";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
export const LIVE_REFRESH_MS = 60_000;

export async function fetchLiveMachine(
  item: LiveIndex["machines"][number], signal: AbortSignal
): Promise<LiveMachine> {
  const response = await fetch(
    `${basePath}/live-data/${encodeURIComponent(item.hallId)}/${encodeURIComponent(item.id)}.json?revision=${item.revision}`,
    { cache: "no-store", signal }
  );
  if (!response.ok) throw new Error("Live machine unavailable");
  const data = await response.json() as LiveMachine;
  if (data.schema !== "evlive-live-machine/v1" || data.revision !== item.revision ||
      data.machine?.id !== item.id || !Array.isArray(data.savedTargets)) {
    throw new Error("Live machine revision mismatch");
  }
  return { ...data, machine: validateMachine(data.machine) };
}

export function startLiveMachineRefresh(
  initial: LiveMachine, hallId: string, onUpdate: (next: LiveMachine) => void
): () => void {
  let revision = initial.revision;
  return startLiveRefresh(async (index, signal) => {
    const item = index.machines.find(candidate => candidate.id === initial.machine.id && candidate.hallId === hallId);
    if (!item || item.revision === revision) return;
    const next = await fetchLiveMachine(item, signal);
    if (signal.aborted) return;
    revision = next.revision;
    onUpdate(next);
  });
}

/** Poll only the small index. The caller fetches a table only when its revision changes. */
export function startLiveRefresh(onIndex: (index: LiveIndex, signal: AbortSignal) => Promise<void> | void): () => void {
  let stopped = false;
  let running = false;
  let lastStarted = -Infinity;
  let controller: AbortController | undefined;

  const refresh = async () => {
    if (stopped || running || document.visibilityState === "hidden" || Date.now() - lastStarted < 5_000) return;
    running = true;
    lastStarted = Date.now();
    controller = new AbortController();
    const signal = controller.signal;
    const timeout = window.setTimeout(() => controller?.abort(), 30_000);
    try {
      // GitHub Pages and the browser may cache static files; also vary the URL on each check.
      const response = await fetch(`${basePath}/live-data/index.json?t=${lastStarted}`, { cache: "no-store", signal });
      if (!response.ok) throw new Error("Live index unavailable");
      const index = await response.json() as LiveIndex;
      if (index.schema !== "evlive-live-index/v1" || !Array.isArray(index.machines) ||
          !index.machines.every(item => /^[a-z0-9_-]+$/.test(item.id) && /^[a-z0-9_-]+$/.test(item.hallId) &&
            /^[a-f0-9]{64}$/.test(item.revision) && item.summary?.id === item.id &&
            typeof item.summary.meta?.samples === "string" && Array.isArray(item.summary.aliases))) {
        throw new Error("Invalid live index");
      }
      if (!signal.aborted && !stopped) await onIndex(index, signal);
    } catch {
      // A failed/offline/partially deployed response must not replace the displayed snapshot.
      // The next timer or return to the page retries it.
    } finally {
      window.clearTimeout(timeout);
      running = false;
    }
  };
  const check = () => { void refresh(); };
  const timer = window.setInterval(check, LIVE_REFRESH_MS);
  window.addEventListener("focus", check);
  window.addEventListener("online", check);
  window.addEventListener("pageshow", check);
  document.addEventListener("visibilitychange", check);
  check();
  return () => {
    stopped = true;
    controller?.abort();
    window.clearInterval(timer);
    window.removeEventListener("focus", check);
    window.removeEventListener("online", check);
    window.removeEventListener("pageshow", check);
    document.removeEventListener("visibilitychange", check);
  };
}
