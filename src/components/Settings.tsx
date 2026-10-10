"use client";

import { useEffect, useState } from "react";

import type {
  CategoryRow,
  FailedArticle,
  NotionHealthResponse,
  RunRow,
} from "@/lib/types";

const REQUIRED_PROPERTIES = [
  "제목 (title)",
  "카테고리 (select)",
  "출처 (select)",
  "원문 링크 (url)",
  "발행일 (date)",
  "저장일 (date)",
];

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      {description && <p className="mt-1 text-xs text-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Settings() {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [failedArticles, setFailedArticles] = useState<FailedArticle[]>([]);
  const [health, setHealth] = useState<NotionHealthResponse | null>(null);
  const [checking, setChecking] = useState(false);
  const [newName, setNewName] = useState("");
  const [newHint, setNewHint] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Bumped after any write so the screen re-reads what the server now holds.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [categoriesResponse, runsResponse] = await Promise.all([
        fetch("/api/categories"),
        fetch("/api/runs"),
      ]);
      if (cancelled) return;

      if (categoriesResponse.ok) {
        const body = await categoriesResponse.json();
        if (!cancelled) setCategories(body.categories);
      }
      if (runsResponse.ok) {
        const body = await runsResponse.json();
        if (!cancelled) {
          setRuns(body.runs);
          setFailedArticles(body.failedArticles);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  function reload() {
    setReloadToken((token) => token + 1);
  }

  async function call(input: string, init: RequestInit) {
    setError(null);
    const response = await fetch(input, {
      headers: { "content-type": "application/json" },
      ...init,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "요청에 실패했습니다.");
      return false;
    }
    return true;
  }

  async function addCategory() {
    if (!newName.trim()) return;
    const ok = await call("/api/categories", {
      method: "POST",
      body: JSON.stringify({ name: newName, hint: newHint }),
    });
    if (ok) {
      setNewName("");
      setNewHint("");
      reload();
    }
  }

  async function updateCategory(id: number, patch: { name?: string; hint?: string }) {
    const ok = await call(`/api/categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    if (ok) reload();
  }

  async function deleteCategory(category: CategoryRow) {
    const confirmed = window.confirm(
      `"${category.name}"을(를) 삭제하면 이 카테고리의 기사 ${category.articleCount}건이 "기타"로 옮겨집니다. 계속할까요?`,
    );
    if (!confirmed) return;

    const ok = await call(`/api/categories/${category.id}`, { method: "DELETE" });
    if (ok) reload();
  }

  async function checkNotion() {
    setChecking(true);
    setError(null);
    try {
      const response = await fetch("/api/notion/health");
      setHealth(await response.json());
    } finally {
      setChecking(false);
    }
  }

  async function retryFailed() {
    const ok = await call("/api/articles/retry-failed", { method: "POST" });
    if (ok) reload();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">설정</h1>
        <p className="mt-1 text-sm text-muted">
          카테고리와 Notion 연결을 관리하고, 실패한 요약을 다시 돌립니다.
        </p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Section
        title="카테고리"
        description="분류 기준은 LLM 프롬프트에 그대로 들어갑니다. 바꾼 기준은 다음 수집분부터 적용됩니다."
      >
        <ul className="flex flex-col divide-y divide-border">
          {categories.map((category) => (
            <li key={category.id} className="flex flex-wrap items-center gap-2 py-3">
              <input
                defaultValue={category.name}
                disabled={category.isFallback}
                onBlur={(event) => {
                  const value = event.target.value.trim();
                  if (value && value !== category.name) {
                    void updateCategory(category.id, { name: value });
                  }
                }}
                className="w-32 rounded-lg border border-border bg-background px-2 py-1 text-sm disabled:opacity-60"
              />
              <input
                defaultValue={category.hint ?? ""}
                placeholder="분류 기준 (선택)"
                onBlur={(event) => {
                  const value = event.target.value.trim();
                  if (value !== (category.hint ?? "")) {
                    void updateCategory(category.id, { hint: value });
                  }
                }}
                className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1 text-sm"
              />
              <span className="text-xs text-muted">{category.articleCount}건</span>
              <button
                type="button"
                onClick={() => deleteCategory(category)}
                disabled={category.isFallback}
                title={category.isFallback ? "기타는 삭제할 수 없습니다" : undefined}
                className="rounded-lg border border-border px-2 py-1 text-xs transition-colors hover:bg-surface-muted disabled:opacity-40"
              >
                삭제
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="새 카테고리"
            className="w-32 rounded-lg border border-border bg-background px-2 py-1 text-sm"
          />
          <input
            value={newHint}
            onChange={(event) => setNewHint(event.target.value)}
            placeholder="분류 기준 (선택)"
            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={addCategory}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
          >
            추가
          </button>
        </div>
      </Section>

      <Section
        title="Notion 연결"
        description="노션 데이터베이스는 직접 만들고 integration을 연결해 두어야 합니다."
      >
        <button
          type="button"
          onClick={checkNotion}
          disabled={checking}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface-muted disabled:opacity-50"
        >
          {checking ? "확인 중…" : "연결 상태 점검"}
        </button>

        {health && (
          <div className="mt-3 text-sm">
            {health.ok ? (
              <p className="text-accent">
                연결 정상 — {health.databaseTitle}
              </p>
            ) : (
              <ul className="flex list-inside list-disc flex-col gap-1 text-danger">
                {health.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <p className="mt-4 text-xs text-muted">
          필요한 속성: {REQUIRED_PROPERTIES.join(", ")}
        </p>
      </Section>

      <Section
        title="요약 실패"
        description="실패한 기사는 다시 대기열에 올려 재시도할 수 있습니다."
      >
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">{failedArticles.length}건</span>
          <button
            type="button"
            onClick={retryFailed}
            disabled={failedArticles.length === 0}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface-muted disabled:opacity-40"
          >
            실패 건 재시도
          </button>
        </div>

        {failedArticles.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2 text-xs">
            {failedArticles.slice(0, 10).map((article) => (
              <li key={article.id} className="flex flex-col gap-0.5">
                <a href={article.url} target="_blank" rel="noreferrer" className="truncate">
                  {article.titleEn}
                </a>
                <span className="text-danger">{article.error}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="실행 기록" description="최근 10회">
        {runs.length === 0 ? (
          <p className="text-sm text-muted">아직 실행 기록이 없습니다.</p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="text-muted">
              <tr>
                <th className="py-1 font-medium">시각</th>
                <th className="py-1 font-medium">읽음</th>
                <th className="py-1 font-medium">신규</th>
                <th className="py-1 font-medium">요약</th>
                <th className="py-1 font-medium">실패</th>
                <th className="py-1 font-medium">오류</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-t border-border">
                  <td className="py-1.5">
                    {new Date(run.startedAt).toLocaleString("ko-KR")}
                  </td>
                  <td className="py-1.5">{run.fetched}</td>
                  <td className="py-1.5">{run.inserted}</td>
                  <td className="py-1.5">{run.enriched}</td>
                  <td className="py-1.5">{run.failed}</td>
                  <td className="py-1.5 text-danger">
                    {run.errors.length > 0 ? run.errors[0].message : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}
