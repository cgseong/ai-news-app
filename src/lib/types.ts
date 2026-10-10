/** Shapes the API routes hand to the client components. */

export type FeedArticle = {
  id: number;
  url: string;
  source: string;
  titleEn: string;
  titleKo: string | null;
  summaryKo: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
  status: "pending" | "enriched" | "failed" | string;
  error: string | null;
  notionPageId: string | null;
  categoryId: number | null;
  categoryName: string | null;
};

export type CategoryRow = {
  id: number;
  name: string;
  hint: string | null;
  sortOrder: number;
  isFallback: boolean;
  articleCount: number;
};

export type RunRow = {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  fetched: number;
  inserted: number;
  enriched: number;
  failed: number;
  errors: { stage: string; source?: string; url?: string; message: string }[];
};

export type FailedArticle = {
  id: number;
  titleEn: string;
  url: string;
  error: string | null;
};

export type NotionHealthResponse = {
  ok: boolean;
  databaseTitle: string | null;
  issues: string[];
};
