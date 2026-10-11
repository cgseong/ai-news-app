"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PendingDot } from "@/components/PendingDot";
import type { CategoryRow } from "@/lib/types";

/**
 * The dashboard's category bar (ui.md §5.3): 전체 → categories → ＋ 카테고리.
 * Filtering is a link, not client state, so a filtered view is shareable and
 * survives a reload; only the add button needs JavaScript.
 */
export function CategoryBar({
  categories,
  totalArticles,
  selected,
}: {
  categories: CategoryRow[];
  totalArticles: number;
  selected: number | null;
}) {
  return (
    <nav className="flex flex-wrap items-center gap-2">
      <CategoryLink
        href="/dashboard"
        label="전체"
        count={totalArticles}
        active={selected === null}
      />
      {categories.map((category) => (
        <CategoryLink
          key={category.id}
          href={`/dashboard?category=${category.id}`}
          label={category.name}
          count={category.articleCount}
          active={selected === category.id}
        />
      ))}
      <AddCategoryButton />
    </nav>
  );
}

function CategoryLink({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
        active
          ? "border-accent bg-accent font-medium text-accent-contrast"
          : "border-border bg-surface text-muted hover:border-accent/40 hover:text-accent"
      }`}
    >
      {label}
      <span className="ml-1.5 text-xs opacity-70">{count}</span>
      {/* The list is server-rendered, so a switch waits on the server; say so. */}
      <PendingDot />
    </Link>
  );
}

/**
 * Sits at the end of the bar. Dashed, never selected — it is an action, not a
 * tab. Opening it swaps the button for an input in the same slot, so the bar
 * does not reflow.
 */
function AddCategoryButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setName("");
    setError(null);
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return close();

    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "카테고리를 추가하지 못했습니다.");
      }
      setOpen(false);
      setName("");
      // The bar is server-rendered, so re-read the page to pick up the new tab.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="카테고리 추가"
        className="rounded-full border border-dashed border-border px-3.5 py-1.5 text-sm text-muted transition-colors hover:border-accent/40 hover:bg-accent-soft hover:text-accent"
      >
        <span aria-hidden className="mr-1">
          ＋
        </span>
        카테고리
      </button>
    );
  }

  // On a phone the form takes the whole row — an input, a button and an error
  // message do not fit beside the tabs at 375px.
  return (
    <span className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <input
        autoFocus
        value={name}
        disabled={saving}
        placeholder="카테고리 이름"
        aria-label="새 카테고리 이름"
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void save();
          if (event.key === "Escape") close();
        }}
        onBlur={() => {
          if (!saving && !name.trim()) close();
        }}
        className="min-w-0 flex-1 rounded-full border border-accent/40 bg-surface px-3.5 py-1.5 text-sm outline-none placeholder:text-muted disabled:opacity-50 sm:w-40 sm:flex-none"
      />
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="shrink-0 rounded-full bg-accent px-3.5 py-1.5 text-sm font-medium text-accent-contrast transition-colors hover:bg-accent-strong disabled:opacity-50"
      >
        {saving ? "추가 중…" : "추가"}
      </button>
      {error && (
        <span role="alert" className="basis-full text-xs text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
