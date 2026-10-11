"use client";

/**
 * The dashboard reads the database at request time, so a dead connection or a
 * missing DATABASE_URL lands here instead of in Next's default error screen.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col gap-7">
      <h1 className="text-2xl font-semibold tracking-tight">AI 뉴스</h1>

      <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface px-6 py-16 text-center">
        <p className="text-sm font-medium text-danger">기사를 불러오지 못했습니다.</p>
        {/* Single-user app: the real message is more useful than a generic one. */}
        <p className="max-w-lg text-xs break-words text-muted">{error.message}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-3 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium transition-colors hover:border-accent/40 hover:bg-accent-soft hover:text-accent"
        >
          다시 시도
        </button>
      </div>
    </div>
  );
}
