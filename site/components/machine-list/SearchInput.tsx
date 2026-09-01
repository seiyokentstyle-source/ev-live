"use client";

type SearchInputProps = {
  value: string;
  onChange: (value: string) => void;
};

export function SearchInput({ value, onChange }: SearchInputProps) {
  return (
    /* Layer 2。input 自体を黒く塗らず、glass-control の面の上に文字だけ置く。
       focus 時だけ Ice Blue の edge light を足す（:focus-within で外枠へ伝える）。 */
    <div className="glass-control relative h-[52px] rounded-[22px] focus-within:border-[rgba(169,231,255,0.45)] focus-within:shadow-[0_2px_4px_rgba(0,0,0,0.3),0_10px_26px_-14px_rgba(0,0,0,0.6),0_0_20px_-4px_rgba(169,231,255,0.4),inset_0_1px_0_rgba(255,255,255,0.18)]">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="機種名・略称で検索"
        aria-label="機種名・略称で検索"
        className="mono relative h-full w-full rounded-[22px] bg-transparent pl-4 pr-12 text-sm text-ink outline-none placeholder:text-muted"
      />
      {value.length > 0 ? (
        <button
          type="button"
          aria-label="検索をクリア"
          onClick={() => onChange("")}
          className="glass-floating absolute right-2 top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center text-sm text-ink-soft"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
