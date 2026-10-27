import Link from "next/link";

const linkClass =
  "relative flex min-h-[54px] items-center justify-center gap-2.5 rounded-full px-3 py-2 text-xs font-bold transition-colors focus-visible:outline-offset-[-3px]";

export function HomeNavigation() {
  return (
    <nav
      aria-label="メインナビゲーション"
      className="glass-floating absolute inset-x-4 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-30 grid grid-cols-2 gap-1.5 p-1.5 [&:active]:scale-100"
    >
      <Link
        href="/machines"
        aria-current="page"
        className={`${linkClass} bg-white/15 text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] hover:bg-white/20`}
      >
        <svg aria-hidden="true" width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="4" />
          <path d="M3 9h18M9 9v12M3 15h18" />
        </svg>
        <span>期待値表一覧</span>
      </Link>
      <Link
        href="/halls/shinjuku/heatmap"
        className={`${linkClass} text-ink-soft hover:bg-white/10 hover:text-ink`}
      >
        <svg aria-hidden="true" width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 5 6 3 6-3v14l-6 3-6-3-6 3V8l6-3Z" />
          <path d="M9 5v14M15 8v14" />
        </svg>
        <span>フロアマップ</span>
      </Link>
    </nav>
  );
}
