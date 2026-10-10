import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  /** Classification guidance handed to the LLM alongside the category name. */
  hint: text("hint"),
  sortOrder: integer("sort_order").notNull().default(0),
  /** Exactly one row is the fallback ("기타"): it cannot be renamed or deleted. */
  isFallback: boolean("is_fallback").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const articles = pgTable(
  "articles",
  {
    id: serial("id").primaryKey(),
    /** Dedup key across runs. */
    url: text("url").notNull().unique(),
    source: text("source").notNull(),
    /** Byline as the feed gives it — may be several names, or absent. */
    author: text("author"),
    titleEn: text("title_en").notNull(),
    contentEn: text("content_en"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    imageUrl: text("image_url"),
    titleKo: text("title_ko"),
    summaryKo: text("summary_ko"),
    categoryId: integer("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    categoryReason: text("category_reason"),
    /** pending | enriched | failed */
    status: text("status").notNull().default("pending"),
    error: text("error"),
    /** e.g. "anthropic:claude-opus-5-5" — which provider/model wrote the summary. */
    llmModel: text("llm_model"),
    notionPageId: text("notion_page_id"),
    notionSavedAt: timestamp("notion_saved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("articles_status_idx").on(t.status),
    index("articles_category_idx").on(t.categoryId),
    index("articles_published_idx").on(t.publishedAt),
  ],
);

export type RunError = {
  stage: "fetch" | "enrich";
  source?: string;
  url?: string;
  message: string;
};

export const runs = pgTable("runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  fetched: integer("fetched").notNull().default(0),
  inserted: integer("inserted").notNull().default(0),
  enriched: integer("enriched").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  errors: jsonb("errors").$type<RunError[]>().notNull().default([]),
});

export type Category = typeof categories.$inferSelect;
export type Article = typeof articles.$inferSelect;
export type Run = typeof runs.$inferSelect;
