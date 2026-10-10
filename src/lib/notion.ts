import { Client, isFullDataSource, isFullDatabase } from "@notionhq/client";

import type { Article } from "@/db/schema";
import { SOURCE_LABELS } from "@/lib/sources";

/** The Notion database the user prepared by hand (PRD §5 F5). */
export const REQUIRED_PROPERTIES: { name: string; type: string }[] = [
  { name: "제목", type: "title" },
  { name: "카테고리", type: "select" },
  { name: "출처", type: "select" },
  { name: "원문 링크", type: "url" },
  { name: "발행일", type: "date" },
  { name: "저장일", type: "date" },
];

export class NotionNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotionNotConfiguredError";
  }
}

function getConfig() {
  const apiKey = process.env.NOTION_API_KEY;
  const databaseId = process.env.NOTION_DATABASE_ID;

  if (!apiKey) throw new NotionNotConfiguredError("NOTION_API_KEY is not set.");
  if (!databaseId) throw new NotionNotConfiguredError("NOTION_DATABASE_ID is not set.");

  return { client: new Client({ auth: apiKey }), databaseId };
}

/**
 * Notion's 2025-09-03 API (what @notionhq/client v5 speaks) hangs pages off a
 * data source rather than the database itself, so resolve it from the id the
 * user pasted. Single-source databases are the normal case.
 */
async function resolveDataSourceId(client: Client, databaseId: string): Promise<string> {
  const database = await client.databases.retrieve({ database_id: databaseId });

  if (!isFullDatabase(database) || database.data_sources.length === 0) {
    throw new Error("That Notion database exposes no data source.");
  }

  return database.data_sources[0].id;
}

function toDateString(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export async function saveArticleToNotion(
  article: Article,
  categoryName: string | null,
): Promise<string> {
  const { client, databaseId } = getConfig();
  const dataSourceId = await resolveDataSourceId(client, databaseId);

  const title = article.titleKo ?? article.titleEn;
  const published = toDateString(article.publishedAt);

  const page = await client.pages.create({
    parent: { type: "data_source_id", data_source_id: dataSourceId },
    properties: {
      제목: { title: [{ text: { content: title.slice(0, 2000) } }] },
      ...(categoryName ? { 카테고리: { select: { name: categoryName } } } : {}),
      출처: { select: { name: SOURCE_LABELS[article.source] ?? article.source } },
      "원문 링크": { url: article.url },
      ...(published ? { 발행일: { date: { start: published } } } : {}),
      저장일: { date: { start: new Date().toISOString() } },
    },
    children: [
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            { type: "text", text: { content: (article.summaryKo ?? "").slice(0, 2000) } },
          ],
        },
      },
      { object: "block", type: "divider", divider: {} },
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            { type: "text", text: { content: article.titleEn.slice(0, 2000) } },
          ],
        },
      },
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: { content: article.url, link: { url: article.url } },
            },
          ],
        },
      },
    ],
  });

  return page.id;
}

export type NotionHealth = {
  ok: boolean;
  databaseTitle: string | null;
  issues: string[];
};

/** Settings-screen preflight: token, database access, and the expected columns. */
export async function checkNotionHealth(): Promise<NotionHealth> {
  const issues: string[] = [];

  let config: ReturnType<typeof getConfig>;
  try {
    config = getConfig();
  } catch (error) {
    return {
      ok: false,
      databaseTitle: null,
      issues: [error instanceof Error ? error.message : String(error)],
    };
  }

  try {
    const database = await config.client.databases.retrieve({
      database_id: config.databaseId,
    });

    if (!isFullDatabase(database)) {
      return { ok: false, databaseTitle: null, issues: ["Notion returned a partial database object."] };
    }

    const databaseTitle =
      database.title.map((t) => t.plain_text).join("") || "(제목 없음)";

    if (database.data_sources.length === 0) {
      return { ok: false, databaseTitle, issues: ["That database exposes no data source."] };
    }

    const dataSource = await config.client.dataSources.retrieve({
      data_source_id: database.data_sources[0].id,
    });

    if (!isFullDataSource(dataSource)) {
      return { ok: false, databaseTitle, issues: ["Notion returned a partial data source object."] };
    }

    for (const required of REQUIRED_PROPERTIES) {
      const property = dataSource.properties[required.name];
      if (!property) {
        issues.push(`"${required.name}" 속성이 없습니다 (${required.type} 타입으로 추가하세요).`);
      } else if (property.type !== required.type) {
        issues.push(
          `"${required.name}" 속성이 ${property.type} 타입입니다 — ${required.type} 이어야 합니다.`,
        );
      }
    }

    return { ok: issues.length === 0, databaseTitle, issues };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      databaseTitle: null,
      issues: [
        `Notion 접근 실패: ${message} — integration이 해당 데이터베이스에 연결되어 있는지 확인하세요.`,
      ],
    };
  }
}
