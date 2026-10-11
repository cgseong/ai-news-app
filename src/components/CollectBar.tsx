"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

const POLL_INTERVAL_MS = 3000;
/**
 * Ticks with no change before the poller gives up (~30s). Needed because
 * `enrichPending()` leaves rows `pending` — not `failed` — when no LLM key is
 * configured, so a count that never moves is a real and permanent state, not a
 * slow one. Without this the page would poll Clerk and the DB forever.
 */
const POLL_STALL_TICKS = 10;

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
  const [pending, setPending] = useState(0);
  // Bumped after a collect to restart a poller that had stopped.
  const [pollNonce, setPollNonce] = useState(0);

  /**
   * Phase 2 runs in `after()` once /api/collect has answered, so the toolbar
   * watches the pending count and re-reads the server-rendered list as cards
   * fill in. It polls on mount too, not just after a collect: a pass killed
   * mid-batch leaves rows pending that nothing else would surface.
   */
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let previous: number | null = null;
    let stalled = 0;

    const tick = async () => {
      // Don't spend a session check every 3s on a tab nobody is looking at.
      if (document.visibilityState === "hidden") {
        timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
        return;
      }

      let count: number;
      try {
        const response = await fetch("/api/articles/pending-count");
        // A 401 (session gone) would otherwise loop forever. Stop instead.
        if (!response.ok) return;
        count = ((await response.json()) as { pending: number }).pending;
      } catch {
        // A hiccup shouldn't break the page — but don't spin on it either.
        return;
      }
      if (cancelled) return;

      setPending(count);

      // Only on an actual decrease, which is the only thing that means cards
      // filled in. `N -> 0` is a decrease too, so this doubles as the final
      // refresh — one branch, and no way to fire twice for one transition.
      if (previous !== null && count < previous) {
        startRefresh(() => router.refresh());
      }

      stalled = previous !== null && count === previous ? stalled + 1 : 0;
      previous = count;

      if (count > 0 && stalled < POLL_STALL_TICKS) {
        timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
      }
    };

    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [pollNonce, router]);

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
          ? `새 기사 ${body.inserted}건을 가져왔습니다. 요약 중입니다…`
          : "최근 24시간 내 새로운 기사가 없습니다.",
      );

      // One dead feed doesn't fail the run, so its error sits *next to* the
      // notice rather than replacing it.
      if (body.errors?.length) {
        setError(body.errors.map((e: { message: string }) => e.message).join(" / "));
      }

      // The list below is server-rendered; this re-reads it in place.
      startRefresh(() => router.refresh());
      // Summaries start landing now, so restart the poller if it had stopped.
      setPollNonce((nonce) => nonce + 1);
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
          {/* ui.md §5.2: the subtitle *is* the status line — progress replaces
              the stored count rather than appearing beside it. `subtitle` is an
              already-rendered server element, so swapping it out and back costs
              no round trip. */}
          {pending > 0 ? (
            <p className="mt-1.5 text-sm text-muted">{pending}건 요약 중…</p>
          ) : (
            subtitle
          )}
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
