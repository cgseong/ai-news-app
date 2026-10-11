# AI 뉴스 수집기 — UI 가이드

> 최종 수정: 2026-10-11
> 대상: Tailwind CSS v4 (`src/app/globals.css`의 `@theme inline`). `tailwind.config.js`는 없다.

이 문서는 **화면을 어떻게 그리는지**에 대한 규칙이다. 데이터 흐름과 기능 범위는 `PRD.md`,
아키텍처는 `CLAUDE.md`를 본다.

---

## 1. 디자인 원칙

1. **읽는 화면이지 조작하는 화면이 아니다.** 기본 동작은 "훑어보기"다. 버튼·배지·색은
   카드가 읽히는 것을 방해하지 않는 선까지만 쓴다.
2. **강조색은 한 화면에 한 종류.** 파란 accent는 *주 동작*(뉴스 가져오기, Notion 저장,
   선택된 카테고리, 카테고리 배지)에만 쓴다. 그 외는 흑백 + 회색 텍스트.
3. **카드는 서로 똑같이 생긴다.** 이미지가 없는 출처(TechCrunch)도 대체 커버로 같은 높이를
   유지해 그리드가 들쭉날쭉해지지 않게 한다.
4. **빈 상태·실패 상태도 디자인한다.** 요약 중/요약 실패/기사 없음은 각각 정해진 모양이 있다
   (§7). 에러를 지우고 조용히 비워 두지 않는다.
5. **토큰으로만 색을 쓴다.** `text-gray-500`, `bg-blue-600` 같은 Tailwind 기본 팔레트를 쓰지
   않는다. 라이트/다크가 자동으로 뒤집히는 것은 §2의 토큰뿐이다.

---

## 2. 색 토큰

`globals.css`의 CSS 변수로 정의하고 `@theme inline`에서 Tailwind 유틸리티로 노출한다.
다크 모드는 `prefers-color-scheme`로 자동 전환되며, **토글 UI는 없다.**

| 토큰 | 유틸리티 | 쓰임 | Light | Dark |
|---|---|---|---|---|
| `--background` | `bg-background` | 페이지 바탕 | `#f5f8fd` | `#0a1120` |
| `--foreground` | `text-foreground` | 본문·제목 | `#0f1b2d` | `#e7edf8` |
| `--surface` | `bg-surface` | 카드, 헤더, 패널 | `#ffffff` | `#111b2e` |
| `--surface-muted` | `bg-surface-muted` | 중성 칩, 스켈레톤, 비활성 버튼 | `#eef3fa` | `#1a2740` |
| `--border` | `border-border` | 모든 테두리·구분선 | `#dde6f2` | `#22314e` |
| `--muted` | `text-muted` | 보조 텍스트(요약, 날짜, 출처) | `#5a6b85` | `#93a4c0` |
| `--accent` | `bg-accent` / `text-accent` | 주 동작, 선택 상태 | `#2563eb` | `#60a5fa` |
| `--accent-strong` | `hover:bg-accent-strong` | accent 버튼 hover | `#1d4ed8` | `#93c5fd` |
| `--accent-contrast` | `text-accent-contrast` | **accent 위에 얹는 글자색** | `#ffffff` | `#0a1120` |
| `--accent-soft` | `bg-accent-soft` | 연한 강조 배경(알림, 칩, hover) | `#e8f0fe` | `#15253f` |
| `--danger` | `text-danger` | 실패 메시지, 삭제 | `#c2410c` | `#f08a5d` |

> **주의:** accent 위의 글자는 반드시 `text-accent-contrast`다. 다크 모드에서 accent가 밝은
> 파랑으로 바뀌기 때문에 `text-white`로 적으면 대비가 깨진다.

그림자는 `shadow-[var(--shadow-card)]` / `hover:shadow-[var(--shadow-card-hover)]` 두 개만 쓴다.
Tailwind의 `shadow-md` 류는 쓰지 않는다.

**배경 워시:** `body::before`가 상단 22rem에 `--accent-soft` → 투명 그라데이션을 깐다.
페이지마다 따로 배경을 칠하지 않는다.

---

## 3. 타이포그래피

본문 글꼴은 Geist(`--font-geist-sans`) + `Apple SD Gothic Neo`/`Malgun Gothic` 한글 폴백.
한국어 본문이므로 자간은 기본, 제목에만 `tracking-tight`.

| 역할 | 클래스 |
|---|---|
| 화면 제목 (대시보드 h1) | `text-2xl font-semibold tracking-tight` |
| 카드 제목 | `text-[17px] leading-snug font-semibold tracking-tight` + `line-clamp-2` |
| 섹션/패널 제목 | `text-sm font-semibold tracking-tight` |
| 본문·요약 | `text-sm leading-relaxed text-muted` + `line-clamp-3` |
| 메타(출처·날짜) | `text-xs text-muted` |
| 칩·배지 | `text-[11px] font-medium tracking-tight` |

제목과 요약은 **항상 `line-clamp`로 잘라** 카드 높이를 맞춘다(제목 2줄, 요약 3줄).

---

## 4. 레이아웃

```
┌ Header  (border-b, bg-surface, 높이 고정)
│  AI 뉴스 수집기            피드 · 설정 · UserButton
├ main    (mx-auto max-w-6xl px-4 sm:px-6 py-8)
│  ┌ 툴바   제목 + 부제 ──────────────── [뉴스 가져오기]
│  ├ 알림   (있을 때만: notice / error)
│  ├ 카테고리 바   [전체 34] [모델·연구 12] … [＋ 카테고리]
│  └ 카드 그리드   grid gap-5 sm:grid-cols-2 lg:grid-cols-3
│      └ [더 보기]
```

- 폭: `max-w-6xl`(72rem) 고정. 그 이상 넓히지 않는다.
- 세로 리듬: 대시보드 내부 블록 간격은 `flex flex-col gap-7`, 카드 그리드는 `gap-5`,
  카드 내부는 `gap-2.5`.
- 반응형 분기점은 `sm`(2열)과 `lg`(3열) 둘뿐이다. 모바일은 1열.
- 라운딩: 카드 `rounded-2xl`, 버튼·패널·알림 `rounded-xl`, 작은 버튼 `rounded-lg`,
  칩·탭 `rounded-full`.

---

## 5. 컴포넌트

### 5.1 Header (`src/components/Header.tsx`)
`border-b border-border bg-surface`. 좌측은 대시보드로 가는 앱 이름, 우측은 `피드 / 설정 /
UserButton`. 링크는 `text-muted hover:text-foreground`. 헤더에 동작 버튼을 두지 않는다 —
수집은 대시보드 툴바의 일이다.

### 5.2 툴바 (`CollectBar.tsx`)
```tsx
<div className="flex flex-wrap items-end justify-between gap-3">
  <div>
    <h1 className="text-2xl font-semibold tracking-tight">AI 뉴스</h1>
    <p className="mt-1.5 text-sm text-muted">{subtitle}</p>   {/* "34건 보관 중" / "5건 요약 중…" */}
  </div>
  <button className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-contrast
                     shadow-sm transition-colors hover:bg-accent-strong disabled:opacity-50">
    뉴스 가져오기
  </button>
</div>
```
부제는 **상태 표시줄**이다. 진행 중에는 남은 건수를, 평소에는 보관 건수를 보여준다.
진행 상태를 별도 토스트나 스피너로 띄우지 않는다.

수집 결과는 툴바 **바로 아래** 한 줄로 붙는다 — 성공은 알림(accent-soft), 피드 하나가
죽은 경우는 에러(danger)다. 둘은 배타적이지 않다: 한쪽 피드만 실패하면 두 줄이 같이 뜬다.

부제의 건수는 서버에서 읽어 `subtitle` prop으로 내려보낸다. 버튼이 정적 셸에 남아 카드
목록을 기다리지 않고 바로 눌리게 하기 위해서다. 카운트가 도착하기 전에는 `skeleton mt-2
h-4 w-24` 한 줄이 그 자리를 지킨다.

`FeedChrome.tsx`의 `FeedToolbar`는 같은 모양의 콜백 버전으로, 지금은 `/preview`만 쓴다.

### 5.3 카테고리 바 (`FeedChrome.tsx` → `CategoryTabs`)

카드 목록 **바로 위**, 알림 영역 아래에 놓인다. 한 줄에 다 안 들어가면 `flex-wrap`으로
자연스럽게 다음 줄로 넘어간다(가로 스크롤 금지).

순서는 고정이다: **`전체` → 카테고리들(정렬 순) → `＋ 카테고리` 버튼**. 추가 버튼은 항상
마지막이며, 줄바꿈이 생겨도 목록의 끝을 따라간다.

```tsx
<nav className="flex flex-wrap items-center gap-2">
  {/* 전체 + 각 카테고리 */}
  <button className={active
    ? "rounded-full border border-accent bg-accent px-3.5 py-1.5 text-sm font-medium text-accent-contrast"
    : "rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm text-muted transition-colors hover:border-accent/40 hover:text-accent"}>
    모델·연구<span className="ml-1.5 text-xs opacity-70">12</span>
  </button>

  {/* 끝에 붙는 추가 버튼 — 탭이 아니라 동작이므로 점선 테두리로 구분한다 */}
  <button
    type="button"
    aria-label="카테고리 추가"
    className="rounded-full border border-dashed border-border px-3.5 py-1.5 text-sm text-muted
               transition-colors hover:border-accent/40 hover:bg-accent-soft hover:text-accent">
    <span aria-hidden className="mr-1">＋</span>카테고리
  </button>
</nav>
```

구현 위치: `/dashboard`는 링크 기반 `CategoryBar.tsx`다 — 선택 상태가 URL의 `?category=`에
남아 공유·새로고침에 견딘다. 콜백 기반 `FeedChrome.tsx`의 `CategoryTabs`는 `/preview`에만
남아 있다.

규칙:
- 건수(`count`)는 탭 안에 `ml-1.5 text-xs opacity-70`으로 붙인다. 0건 카테고리도 숨기지 않는다.
- 추가 버튼은 **탭처럼 보이면 안 된다.** 선택 상태를 갖지 않고, 점선 테두리로 "입력 가능한
  자리"임을 나타낸다.
- 추가 버튼을 누르면 그 자리에서 입력으로 바뀌거나(인라인), 간단한 모달이 뜬다. 어느 쪽이든
  **이름 입력 → Enter 저장 / Esc 취소**를 지원하고, 저장 후 새 탭이 목록 끝에 나타난다.
  이름/힌트 수정과 삭제는 계속 `설정` 화면이 담당한다.
- `기타`(fallback)는 지우거나 이름을 바꿀 수 없다. 추가 UI에서도 같은 이름을 못 쓰게 막는다.

### 5.4 기사 카드 (`ArticleCard.tsx`)

```tsx
<article className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface
                    shadow-[var(--shadow-card)] transition-[box-shadow,border-color,transform] duration-200
                    hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-[var(--shadow-card-hover)]">
```

위에서 아래로:

1. **커버** — `aspect-[16/9] w-full object-cover`, hover 시 `group-hover:scale-[1.03]`.
   이미지가 없으면 `CoverFallback`(accent-soft → surface-muted 그라데이션 위에 출처명).
   원격 CDN이라 `next/image`를 쓰지 않는다 — `<img loading="lazy">` + eslint 예외.
2. **카테고리 배지** — 커버 좌상단 `absolute top-3 left-3`, `bg-accent text-accent-contrast`.
   한 카드에 하나만.
3. **메타 줄** — `출처 · 날짜`. 날짜는 `ko-KR`의 `2026년 10월 11일` 형식. 실패 시 우측 끝에
   `요약 실패` 칩.
4. **제목** — 한국어 제목, 없으면 영어 원제. 2줄 클램프.
5. **요약** — 3줄 클램프 `text-muted`. 한국어 요약이 아직 없으면 **원문 발췌**(피드 본문의
   앞 300자)가 그 자리를 채우고, 메타 줄 우측에 `원문 발췌` 칩(accent)이 붙는다. 실패 시
   같은 자리에 `text-danger`로 에러 메시지.
6. **액션 줄** — `mt-auto pt-4`로 카드 바닥에 고정. 좌측 `원문 보기`(아웃라인),
   우측 `ml-auto`로 `Notion 저장`(accent) / `저장됨 ↗`(중성) / `재시도`(실패 시).
   요약 전 기사는 저장 버튼 대신 `요약 대기 중` 문구만 둔다 — 요약 없는 Notion 페이지를
   만들어 두면 저장은 한 번뿐이라 되돌릴 수 없다.

버튼 변형은 셋뿐이다:

| 변형 | 클래스 | 쓰임 |
|---|---|---|
| Primary | `bg-accent text-accent-contrast hover:bg-accent-strong` | 뉴스 가져오기, Notion 저장 |
| Outline | `border border-border hover:border-accent/40 hover:bg-accent-soft hover:text-accent` | 원문 보기, 재시도, 더 보기 |
| Quiet | `bg-surface-muted text-muted hover:text-foreground` | 저장됨(이미 끝난 동작) |

진행 중 버튼은 `disabled:opacity-50` + 라벨 교체(`저장 중…`, `가져오는 중…`). 스피너는 쓰지 않는다.

### 5.5 설정 화면 (`Settings.tsx`)
`rounded-xl border border-border bg-surface p-5` 패널을 세로로 쌓는다. 제목 `text-sm
font-semibold`, 설명 `text-xs text-muted`. 카드 피드와 달리 그리드를 쓰지 않는다.

---

## 6. 상호작용

- `hover:`는 Tailwind v4가 이미 `@media (hover: hover)`로 감싸므로 터치 기기에서 들러붙지 않는다.
  직접 미디어쿼리를 덧댈 필요가 없다.
- 전이는 색/그림자/위치에만 걸고 `duration-200` 안쪽으로 짧게. 레이아웃이 움직이는 애니메이션은
  카드 hover의 `-translate-y-0.5`가 전부다.
- 포커스 링은 브라우저 기본을 지우지 않는다. `outline-none`을 쓸 거면 대체 링을 반드시 준다.
- 서버에서 그리는 목록으로 가는 링크(카테고리 탭, 더 보기)는 **기다린다는 표시를 준다** —
  `PendingDot`(`useLinkStatus`)을 링크 안에 둔다. 프리페치가 끝난 링크에서는 보이지 않는다.
- 모든 클릭 가능 요소는 `<button type="button">` 또는 `<a>`다. `<div onClick>` 금지.
- 아이콘만 있는 버튼에는 `aria-label`, 장식용 기호(`·`, `＋`)에는 `aria-hidden`.
- 외부 링크는 `target="_blank" rel="noreferrer"`.

---

## 7. 상태별 화면

| 상태 | 모양 |
|---|---|
| 최초 로딩 | `py-16 text-center text-sm text-muted` — "불러오는 중…" |
| 기사 없음 | `rounded-2xl border border-dashed border-border px-6 py-16 text-center`. **막다른 길로 두지 않는다** — 제목 + 설명 + 나가는 길. 두 갈래다: 필터 결과 0건(→ `전체 보기` 링크), 전체 0건(→ 바로 위 `뉴스 가져오기` 안내, 링크 없음) |
| 요약 대기(pending) | 스켈레톤이 아니라 **완성된 카드**다. 영어 원제 + 원문 발췌 + `원문 발췌` 칩. 수집만 되고 분류가 아직 없는 상태가 기본이므로, 읽을 수 있는 카드로 둔다. |
| 요약 실패(failed) | 요약 자리에 `text-danger` 에러, 액션 줄에 `재시도` 버튼 |
| 알림(notice) | `rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent` |
| 에러(error) | `rounded-xl border border-border bg-surface px-4 py-3 text-sm text-danger` |
| 화면 전체 실패 | 라우트의 `error.tsx`. 카드와 같은 `rounded-2xl` 패널에 제목(`text-danger`) + 원인 메시지 + `다시 시도`(아웃라인) |

`.skeleton`은 `globals.css`의 `@layer components` 안에 정의된 유틸(`--surface-muted` 배경 +
`pulse-soft` 1.6s)이다. Tailwind의 `animate-pulse` 대신 이것을 쓰되, **레이어 밖에 두지 않는다** —
레이어 없는 규칙은 Tailwind 유틸리티를 이기므로 `.skeleton`의 기본 `border-radius`가 호출부의
`rounded-full`·`rounded-none`을 덮어쓴다. 같은 이유로 새 전역 CSS도 레이어 안에 넣는다.

---

## 8. 구현 관례

- **피드의 chrome은 `FeedChrome.tsx`에 둔다.** `/preview` 라우트가 같은 컴포넌트를 픽스처로
  렌더하기 때문에, 툴바·카테고리 바를 `Feed.tsx`에 인라인하면 프리뷰가 실물과 어긋난다.
- 디자인을 바꾸면 `/preview`에서 먼저 본다 — DB·로그인·LLM 키 없이 뜬다.
- 클래스 순서: 레이아웃 → 박스 → 타이포 → 색 → 상태(hover/disabled). 조건부 스타일은
  템플릿 리터럴로 분기하되, 공통 클래스는 분기 밖에 둔다.
- 새 색이 필요하면 유틸리티에 직접 쓰지 말고 `globals.css`의 토큰을 먼저 추가한다
  (라이트/다크 두 벌을 같이 넣는다).

---

## 9. 알려진 불일치

- 헤더와 `metadata.title`은 아직 **"AI 뉴스 콜렉터"**다. 이 문서의 기준 명칭은
  **"AI 뉴스 수집기"**이므로, 다음 작업에서 `Header.tsx`·`layout.tsx`·`README.md`를 맞춰야 한다.
- 카테고리 추가 버튼은 `CategoryBar`에만 있고, 이름 수정·삭제는 계속 `설정` 화면이 담당한다.
- 화면은 `/dashboard` 하나다. `/`는 그리로 리다이렉트한다. 클라이언트 피드(`Feed.tsx`)와
  `FeedChrome.tsx`는 지우지 않고 남겨뒀다 — 요약 진행 폴링이 필요한 분류 단계에서 되살린다.
  그때까지 `FeedChrome`은 `/preview`만 쓰므로, 툴바·탭 디자인을 바꾸면 `CollectBar`·
  `CategoryBar`와 같이 고쳐야 한다.
- `원문 발췌`는 임시다. 분류·요약이 붙어 `summaryKo`가 채워지면 칩과 폴백 분기를 걷어낸다.
