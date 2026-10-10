# AI 뉴스 콜렉터 — PRD

> 최종 수정: 2026-10-10

## 1. 개요

해외 AI 뉴스 RSS를 수집해 Claude API로 한국어 번역·요약·분류한 뒤, 카드 형태로 보여주는 개인용 웹앱. 마음에 드는 기사는 버튼 한 번으로 Notion 데이터베이스에 저장한다.

**한 줄 목표:** 영어 AI 뉴스를 매일 훑는 시간을 줄이고, 보관할 만한 기사는 Notion에 쌓는다.

## 2. 범위

### 포함
- RSS 기반 뉴스 수집 (수동 트리거)
- Claude API 번역·요약·카테고리 자동 분류
- 카드 피드 + 카테고리 필터
- 카테고리 CRUD
- 기사 1건 단위 Notion 저장

### 제외 (의도적 비목표)
- 자동 스케줄 수집 (cron, 백그라운드 워커)
- 다중 사용자 / 권한 관리 / 공유
- 알림 (이메일, 푸시, 슬랙)
- 댓글·좋아요 등 소셜 기능
- 원문 웹페이지 스크래핑 (RSS 본문만 사용)
- 전문 검색 엔진 (초기에는 단순 필터만)

## 3. 사용자

**단일 사용자(앱 소유자) 전용.** Clerk 로그인은 "나만 들어온다"는 문지기 역할이며, 사용자별 데이터 분리는 하지 않는다.

- Clerk에서 신규 가입(sign-up)은 비활성화하고 소유자 계정 하나만 허용한다.
- 모든 테이블에 `user_id` 컬럼을 두지 않는다. (추후 다중 사용자가 필요해지면 그때 마이그레이션)
- 로그인하지 않은 접근은 미들웨어에서 전부 `/sign-in`으로 보낸다.

## 4. 데이터 소스

| 소스 | 피드 URL |
|---|---|
| TechCrunch AI | `https://techcrunch.com/category/artificial-intelligence/feed/` |
| The Verge AI | `https://www.theverge.com/rss/ai-artificial-intelligence/index.xml` |

- 피드 목록은 초기엔 코드 내 상수로 둔다. 소스가 3개 이상으로 늘어나면 `sources` 테이블로 승격한다.
- TechCrunch는 RSS 2.0, The Verge는 Atom 형식이다. 두 포맷을 모두 처리하는 파서가 필요하다.
- 각 피드에서 최신 **20건**까지 읽는다.

**실제 피드 확인 결과 (2026-10-10)** — 초기 가정과 달랐던 부분:

| | 본문 | 이미지 | 건수 |
|---|---|---|---|
| TechCrunch | `description` 한 문장 (~100자). `content:encoded` 없음 | 없음 | 20 |
| The Verge | `content` ~700자 | 있음 | 10 |

TechCrunch는 요약의 재료가 제목 + 한 문장뿐이다. 요약 품질이 The Verge보다 얇을 수밖에 없으며,
이를 해결하려면 원문 스크래핑이 필요하다 (§12 열린 질문).

## 5. 기능 요구사항

### F1. 뉴스 수집 (2단계 분리)

사용자가 `뉴스 가져오기` 버튼을 누르면:

**1단계 — 수집 (동기, 수초 내 응답)**
1. 두 피드를 병렬로 가져와 파싱한다.
2. 각 항목에서 `url`, `title_en`, `content_en`, `published_at`, `image_url`, `source`를 추출한다.
3. `url` UNIQUE 제약으로 중복을 거른다 (`ON CONFLICT DO NOTHING`).
4. 신규 기사를 `status='pending'`으로 insert한다.
5. `runs` 레코드를 생성하고, 신규 건수를 즉시 응답한다.

**2단계 — 요약 (비동기)**
6. 클라이언트는 1단계 응답을 받는 즉시 피드를 새로고침한다 → 신규 카드가 "요약 중" 스켈레톤 상태로 나타난다.
7. 서버는 `pending` 기사를 순차 처리하며 Claude를 호출하고 결과를 UPDATE한다.
8. 클라이언트는 `pending` 기사가 남아 있는 동안 **3초 간격으로 폴링**하여 카드를 하나씩 채운다. 0건이 되면 폴링을 멈춘다.
9. 처리 중 페이지를 떠나도 상관없다 — 남은 `pending`은 다음 `뉴스 가져오기` 때 자동으로 재시도된다.

**실패 처리**
- 한 피드가 죽어도 다른 피드 수집은 계속한다.
- 한 기사의 요약이 실패해도 전체 작업은 멈추지 않는다. 해당 기사는 `status='failed'` + `error`에 사유를 남긴다.
- 모든 오류는 `runs.errors`에 누적 기록한다.
- `failed` 기사는 설정 화면의 `실패 건 재시도`로 다시 처리할 수 있다.

### F2. AI 번역·요약·분류

기사 1건당 LLM을 **1회** 호출한다. 어느 벤더로 나가는지는 환경변수가 정한다 (F2.1).

- 기본: Anthropic Claude API, 모델 `claude-opus-5-5`
- 대안: OpenRouter — 키 하나로 여러 벤더 모델을 바꿔가며 써볼 수 있다
- 출력은 JSON 스키마로 강제한다. 강제 방식은 프로바이더마다 다르다 (F2.1)
- `max_tokens`: 8000, 비스트리밍. 요약 자체는 짧지만 Claude 5 계열은 thinking을 끌 수 없고
  thinking 토큰이 `max_tokens`에 함께 잡히므로 여유를 둔다. 대신 `effort`를 `low`로 내려
  이 단순한 작업에 추론 비용을 낭비하지 않는다.

**입력:** 영어 제목 + RSS 본문 + 현재 카테고리 목록(이름 + 분류 힌트)

**출력 JSON:**
```json
{
  "title_ko": "한국어 제목",
  "summary_ko": "핵심 내용 3~4문장 요약",
  "category": "카테고리 목록 중 정확히 하나",
  "category_reason": "그 카테고리를 고른 이유 한 줄"
}
```

- `category`는 반드시 전달한 카테고리 목록 안의 이름이어야 한다. 목록에 없는 값이 오면 "기타"로 떨어뜨린다.
- 요약은 기사를 안 읽어도 무슨 일인지 알 수 있는 수준으로. 원문 표현을 그대로 옮기기보다 핵심을 재구성한다.
- 고유명사(회사명, 모델명, 제품명)는 영문을 유지한다.
- `category_reason`은 분류 품질을 눈으로 확인하기 위한 디버깅용 필드다. 카드 UI에는 노출하지 않는다.

### F2.1 LLM 프로바이더 전환

요약·분류 호출은 프로바이더 뒤에 숨긴다. 호출부는 `enrich(article, categories)` 하나만 알고, 벤더 교체는 환경변수로만 이뤄진다.

| `LLM_PROVIDER` | SDK | 엔드포인트 | 모델 환경변수 |
|---|---|---|---|
| `anthropic` (기본) | `@anthropic-ai/sdk` | Anthropic API | `ANTHROPIC_MODEL` — 기본 `claude-opus-5-5` |
| `openrouter` | `openai` SDK + `baseURL` 교체 | `https://openrouter.ai/api/v1` | `OPENROUTER_MODEL` — 예: `anthropic/claude-opus-5-5` |

**인터페이스**

```ts
type EnrichResult = {
  title_ko: string
  summary_ko: string
  category: string
  category_reason: string
}

interface LlmProvider {
  enrich(input: {
    titleEn: string
    contentEn: string
    categories: { name: string; hint: string | null }[]
  }): Promise<EnrichResult>
}
```

프롬프트는 프로바이더와 무관하게 **한 벌만** 유지한다. 두 구현이 같은 프롬프트 문자열을 공유해야 모델을 바꿔가며 비교하는 의미가 있다.

**OpenRouter 구현 메모**

- OpenRouter는 OpenAI 호환 API다. 전용 SDK 없이 `openai` 패키지에 `baseURL: "https://openrouter.ai/api/v1"` + `apiKey: OPENROUTER_API_KEY`를 주면 된다.
- 모델 ID는 `벤더/모델` 형식이다 (`anthropic/claude-opus-5-5`, `google/gemini-...`, `openai/...`). 벤더 접두사가 빠지면 요청이 거부된다.
- 선택 헤더 `HTTP-Referer`, `X-Title`을 보내면 OpenRouter 대시보드에서 이 앱의 사용량·비용이 따로 집계된다.
- **JSON 강제 방식이 다르다.** Anthropic은 `output_config.format`, OpenRouter는 OpenAI 호환 `response_format: { type: "json_schema", ... }`를 쓴다. 다만 OpenRouter 쪽 `json_schema` 지원 여부는 **모델마다 다르다** — 미지원 모델은 이 파라미터를 무시하거나 에러를 낸다.
- 그래서 공통 안전망을 둔다: 응답 텍스트 JSON 파싱 → 실패하면 코드펜스를 벗겨 1회 재시도 → 그래도 실패하면 해당 기사를 `failed`로 기록. 스키마 검증(Zod)은 프로바이더와 무관하게 파싱 직후 한 번 돌린다.

**전환 규칙**

- `LLM_PROVIDER`가 없으면 `anthropic`으로 동작한다.
- 선택한 프로바이더의 키가 없으면 **앱 기동이 아니라 요약 단계에서** 오류를 남긴다. 키가 없어도 RSS 수집, 기존 기사 열람, Notion 저장은 전부 정상 동작해야 한다 (기사는 `failed`로 쌓이고 키를 넣은 뒤 재시도하면 된다).
- 프로바이더를 바꿔도 이미 요약이 끝난 기사는 다시 호출하지 않는다.
- 어떤 프로바이더·모델로 요약했는지 `articles.llm_model`에 기록해 두면 나중에 품질 비교가 쉬워진다.

### F3. 피드 & 카테고리 필터

- 카드 그리드로 표시, 기본 정렬은 `published_at` 내림차순.
- 상단에 카테고리 탭: `전체` + 등록된 카테고리들 (`sort_order` 순). 탭 선택 시 해당 카테고리만 필터링.
- 각 탭에 기사 수를 함께 표시한다.
- 페이지네이션: 무한 스크롤 또는 `더 보기` 버튼 (1페이지 30건).

**카드 구성**
- 썸네일 (`image_url`이 있을 때만)
- 한국어 제목 (`title_ko`)
- 요약 (`summary_ko`)
- 카테고리 배지
- 출처 + 발행일
- `원문 보기` 링크 (새 탭)
- `Notion 저장` 버튼

**카드 상태**
| `status` | 표시 |
|---|---|
| `pending` | 스켈레톤 + "요약 중…" |
| `enriched` | 정상 카드 |
| `failed` | 영어 원제 + "요약 실패" 배지 + 재시도 버튼 |

### F4. 카테고리 관리

- 설정 화면에서 추가 / 이름 수정 / 삭제 / 순서 변경.
- 각 카테고리에 **분류 힌트**(선택)를 적을 수 있다. 이 문구가 F2 프롬프트에 그대로 들어가 분류 정확도를 조절하는 손잡이가 된다.
- **"기타"는 fallback 카테고리**로 고정 — 삭제·이름변경 불가 (`is_fallback = true`).
- **카테고리를 삭제하면** 해당 카테고리에 속한 기사는 전부 "기타"로 이동한다.
- **카테고리를 추가/수정해도 기존 기사는 재분류하지 않는다.** 다음 수집분부터 적용된다.

**초기 카테고리 (시드)**
| 이름 | 분류 힌트 |
|---|---|
| 모델/연구 | 새 모델 출시, 논문, 벤치마크, 기술적 돌파 |
| 제품/출시 | 소비자·개발자용 제품, 기능 업데이트, 앱 |
| 기업/투자 | 투자 유치, 인수합병, 인사, 실적 |
| 정책/규제 | 법안, 규제, 소송, 저작권 |
| 인프라/칩 | GPU, 데이터센터, 반도체, 클라우드 |
| 기타 | 위 어디에도 맞지 않는 경우 (fallback, 삭제 불가) |

### F5. Notion 저장

- 카드의 `Notion 저장` 버튼 → Notion API로 지정된 데이터베이스에 페이지를 1개 생성한다.
- 인증: **Internal Integration Token** (`NOTION_API_KEY`). OAuth는 쓰지 않는다.
- 저장 대상: `NOTION_DATABASE_ID` 하나로 고정. **노션 DB는 사용자가 직접 만들고 integration을 연결해 둔다** — 앱이 DB를 생성하지 않는다.
- 저장에 성공하면 `articles.notion_page_id`와 `notion_saved_at`을 기록한다.
- **이미 저장된 기사**는 버튼이 `저장됨 ↗`으로 바뀌고 비활성화된다. 클릭 시 노션 페이지로 이동한다.

**속성 매핑** (사용자가 노션 DB에 이 속성들을 미리 만들어 둬야 한다)

| Notion 속성 | 타입 | 값 |
|---|---|---|
| `제목` | Title | `title_ko` |
| `카테고리` | Select | 카테고리 이름 |
| `출처` | Select | `TechCrunch` / `The Verge` |
| `원문 링크` | URL | `url` |
| `발행일` | Date | `published_at` |
| `저장일` | Date | 버튼 클릭 시각 |

**페이지 본문:** 한국어 요약 → 구분선 → 영어 원제 → 원문 링크

- 노션 DB 스키마가 위와 다르면 저장이 실패한다. 설정 화면에서 **연결 상태 점검** 버튼으로 토큰 유효성과 필수 속성 존재 여부를 미리 확인할 수 있게 한다.

### F6. 설정 화면

- 카테고리 관리 (F4)
- Notion 연결 상태 점검 — 토큰 유효성, DB 접근 가능 여부, 필수 속성 존재 여부
- 요약 실패 기사 목록 + `실패 건 재시도`
- 마지막 수집 실행 기록 (`runs` 최근 10건)

## 6. 데이터 모델

Neon(PostgreSQL) + Drizzle ORM.

### `categories`
| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | serial PK | |
| `name` | text UNIQUE NOT NULL | 예: "모델/연구" |
| `hint` | text | Claude 프롬프트에 들어가는 분류 기준 |
| `sort_order` | integer NOT NULL | 탭 표시 순서 |
| `is_fallback` | boolean DEFAULT false | "기타" 한 행만 true |
| `created_at` | timestamptz DEFAULT now() | |

### `articles`
| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | serial PK | |
| `url` | text UNIQUE NOT NULL | **중복 수집 차단 키** |
| `source` | text NOT NULL | `techcrunch` / `theverge` |
| `title_en` | text NOT NULL | |
| `content_en` | text | RSS 본문 원문 |
| `published_at` | timestamptz | |
| `image_url` | text | |
| `title_ko` | text | Claude 결과 |
| `summary_ko` | text | Claude 결과 |
| `category_id` | integer FK → categories.id | ON DELETE 시 "기타"로 재지정 |
| `category_reason` | text | 분류 근거 (디버깅용) |
| `llm_model` | text | 요약에 쓴 프로바이더/모델 (예: `anthropic:claude-opus-5-5`) |
| `status` | text NOT NULL DEFAULT 'pending' | `pending` / `enriched` / `failed` |
| `error` | text | 실패 사유 |
| `notion_page_id` | text | NULL이면 미저장 |
| `notion_saved_at` | timestamptz | |
| `created_at` | timestamptz DEFAULT now() | |

인덱스: `(status)`, `(category_id)`, `(published_at DESC)`

### `runs`
| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | serial PK | |
| `started_at` | timestamptz DEFAULT now() | |
| `finished_at` | timestamptz | |
| `fetched` | integer | RSS에서 읽은 총 건수 |
| `inserted` | integer | 신규 insert 건수 |
| `enriched` | integer | 요약 성공 건수 |
| `failed` | integer | 요약 실패 건수 |
| `errors` | jsonb | `[{ stage, source?, url?, message }]` |

## 7. API

모든 라우트는 Clerk 인증을 요구한다.

| 메서드 | 경로 | 설명 |
|---|---|---|
| `POST` | `/api/collect` | 1단계 수집 → 신규 건수 반환 후 2단계 요약 트리거 |
| `GET` | `/api/articles?category=&cursor=` | 피드 조회 (페이지네이션) |
| `GET` | `/api/articles/pending-count` | 폴링용 — 남은 `pending` 건수 |
| `POST` | `/api/articles/:id/notion` | Notion 페이지 생성 + `notion_page_id` 기록 |
| `POST` | `/api/articles/:id/retry` | 실패 건 요약 재시도 |
| `GET` | `/api/categories` | 목록 (기사 수 포함) |
| `POST` | `/api/categories` | 추가 |
| `PATCH` | `/api/categories/:id` | 이름·힌트·순서 수정 |
| `DELETE` | `/api/categories/:id` | 삭제 (소속 기사는 "기타"로) |
| `GET` | `/api/notion/health` | 토큰·DB·속성 점검 |
| `GET` | `/api/runs` | 최근 실행 기록 |

## 8. 화면

| 경로 | 내용 |
|---|---|
| `/sign-in` | Clerk 로그인. 가입 비활성화 |
| `/` | 피드 — `뉴스 가져오기` 버튼, 마지막 실행 시각, 카테고리 탭, 카드 그리드 |
| `/settings` | 카테고리 관리, Notion 연결 점검, 실패 건 재시도, 실행 기록 |

## 9. 기술 스택

| 영역 | 선택 |
|---|---|
| 프레임워크 | Next.js 16 (App Router, Turbopack) |
| 스타일 | Tailwind v4 (`@theme inline`, `tailwind.config.js` 없음) |
| 인증 | Clerk |
| DB | Neon (PostgreSQL, serverless) |
| ORM | Drizzle ORM + drizzle-kit |
| LLM | 프로바이더 전환형 — Anthropic(`@anthropic-ai/sdk`) 또는 OpenRouter(`openai` SDK + `baseURL` 교체). 기본 `claude-opus-5-5` |
| RSS 파싱 | RSS 2.0 + Atom 모두 처리 |
| Notion | `@notionhq/client` (Internal Integration Token) |
| 배포 | 초기에는 로컬 `npm run dev`. Vercel 배포는 추후 선택 |

### 환경변수
```
DATABASE_URL=                        # Neon connection string
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

LLM_PROVIDER=anthropic               # anthropic | openrouter — 생략 시 anthropic

# LLM_PROVIDER=anthropic 일 때
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-opus-5-5      # 선택, 기본값 동일

# LLM_PROVIDER=openrouter 일 때
OPENROUTER_API_KEY=
OPENROUTER_MODEL=anthropic/claude-opus-5-5
OPENROUTER_APP_URL=http://localhost:3000    # 선택, HTTP-Referer 헤더
OPENROUTER_APP_NAME=AI News Collector       # 선택, X-Title 헤더

NOTION_API_KEY=                      # internal integration token
NOTION_DATABASE_ID=
```

## 10. 비기능 요구사항

- **부분 실패가 전체를 중단시키지 않는다.** 소스 1개 실패, 기사 1건 요약 실패는 모두 기록만 하고 진행한다.
- **중복 저장 방지.** 기사 중복은 `url` UNIQUE로, Notion 중복 저장은 `notion_page_id` 존재 여부로 막는다.
- **응답성.** `뉴스 가져오기` 버튼은 몇 초 안에 응답한다. 긴 작업(요약)은 백그라운드 + 폴링으로 처리한다.
- **비용.** 신규 기사만 Claude를 호출한다. 이미 요약된 기사는 절대 재호출하지 않는다.
- **LLM 키가 없어도 읽기 경로는 살아 있다.** 수집·열람·Notion 저장은 LLM 키와 무관하게 동작한다. 요약만 실패로 쌓이고, 키를 채운 뒤 재시도하면 복구된다.
- **키는 서버에만.** `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `NOTION_API_KEY`는 라우트 핸들러에서만 읽는다. 클라이언트 번들에 들어가지 않게 한다.

## 11. 구현 순서

1. 스캐폴드 복구 (`create-next-app` 산출물이 로컬에서 삭제된 상태) + Tailwind v4 확인
2. Neon 연결 + Drizzle 스키마 + 마이그레이션 + 카테고리 시드
3. Clerk 연동 + 미들웨어로 전 경로 보호
4. RSS 파서 + `POST /api/collect` 1단계 (요약 없이 수집만)
5. 피드 화면 + 카드 UI (아직 영어 원문 표시)
6. LLM 프로바이더 레이어(Anthropic / OpenRouter) + 요약·분류 + 2단계 비동기 처리 + 폴링
7. 카테고리 필터 탭
8. 설정 화면 — 카테고리 CRUD
9. Notion 저장 + 중복 방지 + 연결 점검
10. 실패 건 재시도, 실행 기록 화면

## 12. 열린 질문 / 추후

- **모델 선택** — 기본값은 `claude-opus-5-5`. 기사 요약은 비교적 단순한 작업이라 `claude-haiku-5-5`로 내리면 비용이 크게 줄지만, 요약·분류 품질은 직접 비교해 봐야 안다. OpenRouter를 쓰면 키 하나로 여러 벤더 모델을 같은 프롬프트에 물려 비교할 수 있다 — 같은 기사 20건을 모델별로 돌려 보고 `ANTHROPIC_MODEL` / `OPENROUTER_MODEL` 기본값을 정한다.
- **프로바이더별 JSON 강제** — OpenRouter에서 `json_schema`를 지원하지 않는 모델을 쓰게 되면 파싱 실패율이 올라갈 수 있다. 재시도 1회로 부족하면 프롬프트에 출력 예시를 넣는 쪽으로 보강한다.
- **재분류 버튼** — 카테고리를 크게 손봤을 때 기존 기사를 다시 분류하는 기능. 현재 범위 밖이지만 설정 화면에 추가하기 쉽다.
- **TechCrunch 본문 보강** — 현재 TechCrunch 요약은 한 문장짜리 RSS 발췌만 보고 쓴다. 원문
  페이지를 긁어오면 품질이 올라가지만 스크래핑은 §2에서 비목표로 둔 항목이다. 실제 요약을
  몇 개 읽어 보고 "이 정도면 충분한지" 판단한 뒤 결정한다.
- **검색** — 제목·요약 전문 검색. 기사가 수백 건 쌓이면 필요해진다.
- **소스 추가** — 피드가 늘어나면 `sources` 테이블 + 설정 화면에서 관리.
- **Vercel 배포** — 배포하면 수집 요약 단계가 serverless 함수 실행 시간 제한에 걸릴 수 있다. 그때는 요약을 작은 배치로 쪼개 여러 번 호출하는 방식으로 바꾼다.
