"use client";

type SearchInputProps = {
  value: string;
  onChange: (value: string) => void;
};

export function SearchInput({ value, onChange }: SearchInputProps) {
  return (
    <div className="relative">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="機種名・略称で検索"
        className="mono h-11 w-full rounded-md border border-line bg-panel-2 px-4 pr-11 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-[var(--accent-soft)]"
      />
      {value.length > 0 ? (
        <button
          type="button"
          aria-label="検索をクリア"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md border border-line text-ink-soft active:bg-panel"
        >
          x
        </button>
      ) : null}
    </div>
  );
}
