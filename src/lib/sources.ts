export type Source = {
  /** Stored in articles.source. */
  id: string;
  label: string;
  url: string;
};

/**
 * Feeds are a constant for now. Promote to a `sources` table once there are
 * enough of them to be worth editing without a deploy (PRD §4).
 */
export const SOURCES: Source[] = [
  {
    id: "techcrunch",
    label: "TechCrunch",
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
  },
  {
    id: "theverge",
    label: "The Verge",
    url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
  },
];

export const SOURCE_LABELS: Record<string, string> = Object.fromEntries(
  SOURCES.map((s) => [s.id, s.label]),
);

/** Only items published within this many hours of the run start are collected. */
export const COLLECT_WINDOW_HOURS = 24;

/**
 * Safety cap on how many items one feed may contribute to a single run.
 * Applied *after* the time window, so a busy day is never truncated before the
 * window has had its say.
 */
export const ITEMS_PER_FEED = 20;
