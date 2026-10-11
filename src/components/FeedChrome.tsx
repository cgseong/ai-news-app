"use client";

/**
 * The feed's chrome — heading, collect button, category tabs.
 * Split out of Feed so the design preview at /preview renders the real thing
 * instead of a copy that drifts.
 */

export function FeedToolbar({
  subtitle,
  collecting,
  onCollect,
}: {
  subtitle: string;
  collecting: boolean;
  onCollect: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI 뉴스</h1>
        <p className="mt-1.5 text-sm text-muted">{subtitle}</p>
      </div>
      <button
        type="button"
        onClick={onCollect}
        disabled={collecting}
        className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-contrast shadow-sm transition-colors hover:bg-accent-strong disabled:opacity-50"
      >
        {collecting ? "가져오는 중…" : "뉴스 가져오기"}
      </button>
    </div>
  );
}

export function CategoryTabs({
  categories,
  totalArticles,
  selected,
  onSelect,
}: {
  categories: { id: number; name: string; articleCount: number }[];
  totalArticles: number;
  selected: number | null;
  onSelect: (categoryId: number | null) => void;
}) {
  return (
    <nav className="flex flex-wrap gap-2">
      <TabButton
        active={selected === null}
        label="전체"
        count={totalArticles}
        onClick={() => onSelect(null)}
      />
      {categories.map((category) => (
        <TabButton
          key={category.id}
          active={selected === category.id}
          label={category.name}
          count={category.articleCount}
          onClick={() => onSelect(category.id)}
        />
      ))}
    </nav>
  );
}

function TabButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
        active
          ? "border-accent bg-accent font-medium text-accent-contrast"
          : "border-border bg-surface text-muted hover:border-accent/40 hover:text-accent"
      }`}
    >
      {label}
      <span className="ml-1.5 text-xs opacity-70">{count}</span>
    </button>
  );
}
