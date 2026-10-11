# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

Implemented, not yet run. Next.js 16 app: RSS collection → LLM translation/summary/classification
→ card feed → save to Notion. `PRD.md` is the spec and matches the code.

**Nothing has been executed against real services.** `npm run build`, `npm run lint`, and
`tsc --noEmit` pass, and the RSS parser was verified against both live feeds. The database, Clerk,
LLM, and Notion paths have never run — no credentials exist on this machine. Expect the first real
run to surface integration problems; don't describe those paths as working.

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

- `src/lib/collect.ts` — the two-phase run, and the reason the UI feels fast.
  `collectArticles()` only reads feeds and inserts new rows, so `POST /api/collect` answers in
  seconds; `enrichPending()` does the LLM work and is kicked off from `after()` *after* that
  response is sent. The feed polls `/api/articles/pending-count` every 3s and re-reads the list
  as the count changes. Anything left `pending` is picked up by the next run — there is no queue.
- `src/lib/llm/` — the provider swap. `getLlmProvider()` reads `LLM_PROVIDER` and returns the
  Anthropic (`@anthropic-ai/sdk`) or OpenRouter (`openai` SDK with `baseURL` swapped)
  implementation. **Both share one prompt** (`llm/prompt.ts`) — that is the whole point, so models
  can be compared. JSON enforcement differs per provider (Anthropic `output_config.format`;
  OpenRouter `response_format: json_schema`, which not every model there supports), so OpenRouter
  falls back to a prompt-level JSON request plus a loose parse.
- `src/db/` — Drizzle + Neon, three tables (`articles`, `categories`, `runs`). `db` is a lazy
  Proxy: importing it never throws, so a missing `DATABASE_URL` surfaces on the first query
  instead of at build time.
- `src/app/api/*` — route handlers, all dynamic because they call Clerk's `auth()`.
- `src/lib/queries.ts` — the two list reads (`listArticles`, `listCategories`). The API routes
  and the server-rendered `/dashboard` both go through it, so the card list is built one way.
- `src/app/dashboard/page.tsx` — server-rendered card feed, newest first, filtered by
  `?category=`. Its DB reads are request-time, so they sit behind `<Suspense>`; with
  `cacheComponents` the heading and the skeleton are the static shell. `/` (the client `Feed`)
  still owns collection and the pending poll.
- `proxy.ts` — Clerk route protection. Next.js 16 renamed `middleware.ts` to `proxy.ts`.

### Invariants worth keeping

- **Partial failure never aborts a run.** A dead feed or a failed article is recorded in
  `runs.errors` and the run continues; failures stay retryable.
- **Collection and browsing never depend on an LLM key.** With no key configured, articles still
  collect and display; only summaries fail.
- **`articles.url` is the dedup key; `articles.notion_page_id` is the save-once key.**
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
- **tsx runs project `.ts` files as CJS** (no `"type": "module"`), so top-level `await` fails in
  scripts such as `src/db/seed.ts`. Wrap it in an async `main()`.
- **TechCrunch's feed carries no body and no images** — one `description` sentence per item. The
  Verge carries ~700 characters and an image. Summary quality differs between sources because of
  it, and the fix (scraping) is a non-goal in `PRD.md` §2.
- **`npm audit` reports 5 high findings** in dev-only transitive deps (`eslint-config-next` →
  `braces`, `drizzle-kit` → `esbuild`). `audit fix --force` downgrades those tools to ancient
  majors; leave them.
