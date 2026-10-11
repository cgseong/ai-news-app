"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * The dashboard toolbar (ui.md §5.2) — heading, status line, collect button.
 *
 * The count is handed in from the server as `subtitle` rather than fetched
 * here, so the button lives in the static shell and is clickable before the
 * card list has been read.
 */
export function CollectBar({ subtitle }: { subtitle: React.ReactNode }) {
  const router = useRouter();
  const [collecting, setCollecting] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function collect() {
    setCollecting(true);
    setNotice(null);
    setError(null);

    try {
      const response = await fetch("/api/collect", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "수집에 실패했습니다.");

      setNotice(
        body.inserted > 0
          ? `새 기사 ${body.inserted}건을 가져왔습니다.`
          : "최근 24시간 내 새로운 기사가 없습니다.",
      );

      // One dead feed doesn't fail the run, so its error sits *next to* the
      // notice rather than replacing it.
      if (body.errors?.length) {
        setError(body.errors.map((e: { message: string }) => e.message).join(" / "));
      }

      // The list below is server-rendered; this re-reads it in place.
      startRefresh(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCollecting(false);
    }
  }

  const busy = collecting || refreshing;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI 뉴스</h1>
          {subtitle}
        </div>
        <button
          type="button"
          onClick={collect}
          disabled={busy}
          className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-contrast shadow-sm transition-colors hover:bg-accent-strong disabled:opacity-50"
        >
          {busy ? "가져오는 중…" : "뉴스 가져오기"}
        </button>
      </div>

      {notice && (
        <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent">{notice}</p>
      )}
      {error && (
        <p className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
