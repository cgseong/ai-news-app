# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

Running end to end as of 2026-10-11. Next.js 16 app: RSS collection → LLM
translation/summary/classification → card feed → save to Notion. `PRD.md` is the spec and
matches the code.

**The whole chain has now run against real services on this machine** — Neon, Clerk, OpenRouter,
and Notion. `/dashboard` renders collected articles, enrichment fills the cards, and the
「Notion 저장」 button wrote a real page. Credentials live in `.env.local`, which is
gitignored, so a fresh clone still has none of them and starts back at nothing-has-run.

`npm run build`, `npm run lint`, and `tsc --noEmit` pass. Vercel deployment is still untried:
`after()` is unbounded under `next dev`, so the enrichment pass finishing locally says nothing
about the 300s production budget.

## Commands

```bash
npm run dev          # dev server on :3000
npm run build        # production build; also runs the TypeScript check
npm run lint         # eslint (flat config)
npm run db:generate  # schema change -> new migration SQL under drizzle/
npm run db:migrate   # apply migrations
npm run db:seed      # insert the six starting categories
```

No test runner is configured — there is no single-test invocation to give. If tests are added,
record that command here.

Setup (env vars, Neon, Clerk, the Notion database layout) is in `README.md`; don't duplicate it here.

`ui.md` is the UI guide — color tokens, typography, layout rhythm, the component specs for the
header, toolbar, category bar and article card, and the state-by-state screens. Read it before
touching anything under `src/components/` or `globals.css`, and update it when the design changes;
don't restate its rules here.

## Architecture

Everything lives inside Next.js — route handlers own collection, enrichment, and Notion writes.
There is no separate collector service.

- `src/lib/collect.ts` — the two-phase run. `collectArticles()` only reads feeds and inserts new
  rows, so `POST /api/collect` answers in seconds. It keeps **only items published in the last
  `COLLECT_WINDOW_HOURS` (24)**; an item with no date is skipped, since the window cannot be
  decided for it. `enrichPending()` does the LLM work and is kicked off from `after()` in
  `POST /api/collect` — unconditionally, because "no new articles" is not "no pending backlog".
  It drains the **pending queue**, not the run's own rows, so a run can report
  `inserted: 3, enriched: 28`; `runId` only says where to report. `ENRICH_DEADLINE_MS` stops it
  handing out work near the end of the `after()` budget, and anything left `pending` is picked up
  by the next run — there is no queue. `finishedAt` belongs to phase 2: a run without one had its
  enrichment pass killed.
- `src/app/api/collect/route.ts` — `export const maxDuration = 300` (Vercel fluid default, Hobby
  ceiling) is what `ENRICH_BATCH` and `ENRICH_DEADLINE_MS` are sized against. The `after()`
  callback is wrapped in try/catch and calls `failRun()`: Next turns a throw in there into a
  console line, so without it the run stays open with nothing to show.
- `src/lib/llm/` — the provider swap. `getLlmProvider()` reads `LLM_PROVIDER` and returns the
  OpenRouter (`openai` SDK with `baseURL` swapped, **the default**, model
  `anthropic/claude-haiku-5.5`) or Anthropic (`@anthropic-ai/sdk`) implementation.
  **Both share one prompt** (`llm/prompt.ts`) — that is the whole point, so models can be
  compared. JSON enforcement differs per provider (Anthropic `output_config.format`; OpenRouter
  `response_format: json_schema` pinned with `provider.require_parameters`), and OpenRouter falls
  back to a prompt-level JSON request plus a loose parse whenever the schema path fails to yield
  a parseable result — not only on a particular status code.
- `src/db/` — Drizzle + Neon, three tables (`articles`, `categories`, `runs`). `db` is a lazy
  Proxy: importing it never throws, so a missing `DATABASE_URL` surfaces on the first query
  instead of at build time.
- `src/app/api/*` — route handlers, all dynamic because they call Clerk's `auth()`.
- `src/lib/queries.ts` — the two list reads (`listArticles`, `listCategories`). The API routes
  and the server-rendered `/dashboard` both go through it, so the card list is built one way.
- `src/app/dashboard/page.tsx` — the only screen. Server-rendered card feed, newest first,
  filtered by `?category=`, with the collect button (`CollectBar.tsx`, a client component that
  POSTs `/api/collect` then `router.refresh()`). Its DB reads are request-time, so they sit
  behind `<Suspense>`; with `cacheComponents` the toolbar and the skeleton are the static shell,
  which is why the status-line count is its own boundary with its own `countArticles()` query —
  the button must be pressable before the card list has been read. `CollectBar` also owns the
  `pending-count` poll that fills cards in as summaries land. `/` redirects here; `FeedChrome`
  stays in the tree for `/preview` only.
- `proxy.ts` — Clerk route protection. Next.js 16 renamed `middleware.ts` to `proxy.ts`.

### Invariants worth keeping

- **Partial failure never aborts a run.** A dead feed or a failed article is recorded in
  `runs.errors` and the run continues; failures stay retryable.
- **Collection and browsing never depend on an LLM key.** With no key configured, articles still
  collect and display: the card falls back to the start of the English feed body (`excerptEn`,
  sliced in SQL by `listArticles`), so nothing renders as a bare skeleton.
- **`articles.url` is the dedup key; `articles.notion_page_id` is the save-once key.** URLs are
  normalised (`normalizeUrl` in `rss.ts`: tracking params, fragment, trailing slash) *before*
  they are stored, so the same story under two spellings is one row. Three locks, all needed:
  the unique index, `onConflictDoNothing` across runs, and a `Set` within a run — a single
  INSERT cannot conflict with itself.
- **Deleting a category moves its articles to 기타** (`is_fallback`), which cannot be deleted or
  renamed. Category edits apply to the next collection only — existing articles are never
  reclassified.
- **Single user.** Clerk is a doorman, not multi-tenancy; no table carries a `user_id`.

## Next.js 16 conventions

`AGENTS.md` carries a block written by `next dev`: this Next.js version has breaking changes
relative to older knowledge, so read the relevant guide under `node_modules/next/dist/docs/`
before writing framework code. That block is regenerated on every `next dev`, so commit it with
your work rather than reverting it.

`next.config.ts` enables `cacheComponents` and `partialPrefetching`:

- `GET` route handlers follow the page prerendering model, but anything touching the DB,
  `headers()`, or Clerk's `auth()` goes dynamic automatically — no extra config needed.
- A client component reading the URL (`usePathname`, and therefore Clerk's `<SignIn />`) **must**
  sit inside `<Suspense>` or the build fails with `CLIENT_HOOK_DYNAMIC`.

Tailwind v4 is wired through a Turbopack loader rule in `next.config.ts`, and theme tokens live in
`src/app/globals.css` under `@theme inline`. There is no `tailwind.config.js`.

Imports use `@/*` → `./src/*`.

## Gotchas found the hard way

- **`react-hooks/set-state-in-effect` is an error, not a warning.** Calling a `useCallback`'d
  function that sets state from inside `useEffect` fails lint even when the setState sits behind an
  `await`. The pattern that passes: an inline `void (async () => { ... })()` with a `cancelled`
  flag, setting state only after the awaits.
- **Clerk v7 removed `<SignedIn>` / `<SignedOut>` / `<Protect>`** — they throw at runtime. Use
  server-side `auth()`, route protection in `proxy.ts`, or `<Show>`.
- **`@notionhq/client` v5 speaks the 2025-09-03 API**, where pages hang off a *data source*, not a
  database. Resolve `databases.retrieve(...).data_sources[0].id` first, and read properties from
  `dataSources.retrieve`, not from the database object.
- **A Notion property mismatch only surfaces on write.** The database is the user's to build, so
  its columns drift from `REQUIRED_PROPERTIES`; `pages.create` then fails with
  `"원문 링크 is not a property that exists"` — one line per offending column, and nothing is
  saved. `checkNotionHealth()` (`/api/notion/health`, the settings screen's 「연결 상태 점검」)
  exists to catch that before a save does. Note what it tells you apart: `object_not_found` means
  the integration was never connected to the database, which is a separate step from the token —
  authentication succeeding says nothing about the integration being able to see the page.
- **Killing `next dev` can corrupt the Turbopack cache.** A SIGTERM mid-write leaves the persistent
  cache unreadable and the next start dies with
  `Failed to open database: Loading persistence directory failed`. `rm -rf .next` fixes it; nothing
  else does.
- **Unlayered CSS beats every Tailwind utility.** Tailwind v4 emits utilities inside
  `@layer utilities`, and a rule written outside any layer wins over all of them regardless of
  order — an unlayered `.skeleton { border-radius }` silently overrode `rounded-full` at the
  call site. Global CSS in `globals.css` goes inside `@layer components`.
- **`hover:` is already gated behind `@media (hover: hover)`** by Tailwind v4, so hover styles
  do not stick after a tap on touch devices. Don't add the media query by hand.
- **tsx runs project `.ts` files as CJS** (no `"type": "module"`), so top-level `await` fails in
  scripts such as `src/db/seed.ts`. Wrap it in an async `main()`.
- **TechCrunch's feed carries no body and no images** — one `description` sentence per item. The
  Verge carries ~700 characters and an image. Summary quality differs between sources because of
  it, and the fix (scraping) is a non-goal in `PRD.md` §2.
- **OpenRouter's `response_format` is a soft preference.** If no endpoint behind the model
  supports structured outputs, OpenRouter **drops the parameter silently** and the model answers
  in prose — no error to catch. Endpoint support varies *within one model*: four of the ten
  endpoints for `anthropic/claude-haiku-5.5` (Bedrock, Claude on AWS) do not support it. Pin the
  routing with `provider: { require_parameters: true }` so the mismatch becomes a status you can
  detect, and trigger the prompt-mode fallback on any failure to get a parseable result, not on a
  status code alone.
- **`after()` has no time limit under `next dev`.** It gets the route's max duration, which is
  unbounded locally and 300s on Vercel fluid compute (Hobby's ceiling). A pass that finishes
  locally proves nothing about production — measure it there, and size `ENRICH_BATCH` /
  `ENRICH_CONCURRENCY` / `ENRICH_DEADLINE_MS` against the deployed number.
- **Next swallows exceptions thrown inside `after()`** into a `console.error` and nothing else.
  Anything you want to survive has to be written to the DB by your own catch.
- **`npm audit` reports 5 high findings** in dev-only transitive deps (`eslint-config-next` →
  `braces`, `drizzle-kit` → `esbuild`). `audit fix --force` downgrades those tools to ancient
  majors; leave them.
