import { XMLParser } from "fast-xml-parser";

import { type Source } from "./sources";

export type FeedItem = {
  url: string;
  titleEn: string;
  author: string | null;
  contentEn: string | null;
  publishedAt: Date | null;
  imageUrl: string | null;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  // Feeds are full of &#8217; and friends; decode them rather than shipping
  // escape sequences into the LLM prompt and the card.
  htmlEntities: true,
  // Keep <item>/<entry> an array even when a feed has a single one. Note that
  // <link> must NOT be forced: RSS uses it as a plain string.
  isArray: (name) => name === "item" || name === "entry",
});

/** Feed values can be a string, a CDATA string, or `{ "#text": ... }` with attributes. */
function text(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  if (typeof value === "object" && "#text" in (value as Record<string, unknown>)) {
    return text((value as Record<string, unknown>)["#text"]);
  }
  return null;
}

/**
 * Bylines: TechCrunch (RSS) puts them in <dc:creator>, The Verge (Atom) in
 * <author><name>. Either tag can repeat, and a single TechCrunch creator can
 * already hold several comma-separated names, so flatten everything to one
 * string and let the card print it verbatim.
 */
function authorNames(raw: unknown): string | null {
  const values = Array.isArray(raw) ? raw : [raw];
  const names = values.flatMap((value) => {
    if (value && typeof value === "object" && "name" in (value as AnyRecord)) {
      // Atom: <author><name>Emma Roth</name></author>
      return [text((value as AnyRecord).name)];
    }
    return [text(value)];
  });

  const joined = names.filter((n): n is string => Boolean(n)).join(", ");
  return joined || null;
}

function stripHtml(html: string | null): string | null {
  if (!html) return null;
  const plain = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8216;|&lsquo;/g, "'")
    .replace(/&#8220;|&ldquo;/g, '"')
    .replace(/&#8221;|&rdquo;/g, '"')
    .replace(/&#8230;|&hellip;/g, "...")
    .replace(/\s+/g, " ")
    .trim();
  // The whole article body is more than the model needs, and more than we want to store.
  return plain ? plain.slice(0, 8000) : null;
}

function firstImage(html: string | null): string | null {
  if (!html) return null;
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match ? match[1] : null;
}

/**
 * Query parameters that identify the referrer rather than the article. Feeds
 * append them inconsistently, so the same story can arrive under two URLs —
 * and `articles.url` is the dedup key, so that would mean two rows.
 */
const TRACKING_PARAM = /^(utm_|ref$|ref_|source$|fbclid$|gclid$|mc_cid$|mc_eid$|guccounter$|guce_|_hsenc$|_hsmi$)/i;

/** The dedup key. Same article, same string — whatever the feed spells it as. */
export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  try {
    const url = new URL(trimmed);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
    }
    // ".../post/" and ".../post" are one article; "/" alone is not a trailing slash.
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    // Not a URL we can parse (a bare guid, say) — leave it alone rather than
    // mangling the one string we have to dedup on.
    return trimmed;
  }
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

type AnyRecord = Record<string, unknown>;

function rssItems(channel: AnyRecord): FeedItem[] {
  const items = (channel.item as AnyRecord[]) ?? [];
  return items.flatMap((item) => {
    const url = text(item.link) ?? text(item.guid);
    const titleEn = text(item.title);
    if (!url || !titleEn) return [];

    const body = text(item["content:encoded"]) ?? text(item.description);
    const media = (item["media:thumbnail"] ?? item["media:content"]) as AnyRecord | undefined;
    const enclosure = item.enclosure as AnyRecord | undefined;

    return [
      {
        url: normalizeUrl(url),
        titleEn,
        author: authorNames(item["dc:creator"] ?? item.author),
        contentEn: stripHtml(body),
        publishedAt: parseDate(text(item.pubDate)),
        imageUrl:
          (media?.["@_url"] as string | undefined) ??
          (enclosure?.["@_url"] as string | undefined) ??
          firstImage(body) ??
          null,
      },
    ];
  });
}

function atomEntries(feed: AnyRecord): FeedItem[] {
  const entries = (feed.entry as AnyRecord[]) ?? [];
  return entries.flatMap((entry) => {
    // Atom entries carry one <link> or several; normalise before picking.
    const rawLinks = entry.link;
    const links = (Array.isArray(rawLinks) ? rawLinks : [rawLinks]).filter(
      (l): l is AnyRecord => typeof l === "object" && l !== null,
    );
    const alternate =
      links.find((l) => (l["@_rel"] ?? "alternate") === "alternate") ?? links[0];
    const url = (alternate?.["@_href"] as string | undefined) ?? text(entry.id);
    const titleEn = text(entry.title);
    if (!url || !titleEn) return [];

    const body = text(entry.content) ?? text(entry.summary);

    return [
      {
        url: normalizeUrl(url),
        titleEn,
        author: authorNames(entry.author),
        contentEn: stripHtml(body),
        publishedAt: parseDate(text(entry.published) ?? text(entry.updated)),
        imageUrl: firstImage(body),
      },
    ];
  });
}

/** TechCrunch serves RSS 2.0, The Verge serves Atom — handle both. */
export function parseFeed(xml: string): FeedItem[] {
  const doc = parser.parse(xml) as AnyRecord;

  const rss = doc.rss as AnyRecord | undefined;
  if (rss?.channel) return rssItems(rss.channel as AnyRecord);

  const feed = doc.feed as AnyRecord | undefined;
  if (feed) return atomEntries(feed);

  return [];
}

export async function fetchFeed(source: Source): Promise<FeedItem[]> {
  const response = await fetch(source.url, {
    headers: { "user-agent": "ai-news-collector/0.1 (personal use)" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`${source.label} responded ${response.status}`);
  }

  // No cap here: the time window in collect.ts decides what counts as new, and
  // capping first would hide fresh items behind stale ones.
  return parseFeed(await response.text());
}
