# AI 뉴스 콜렉터

해외 AI 뉴스 RSS를 수집해 Claude(또는 OpenRouter 경유 모델)로 한국어 번역·요약·분류하고,
카드 피드로 보여주는 개인용 웹앱. 마음에 드는 기사는 버튼 하나로 Notion에 저장합니다.

전체 사양은 [`PRD.md`](./PRD.md)에 있습니다.

## 준비물

| 항목 | 용도 |
|---|---|
| Node.js 20+ | 실행 |
| [Neon](https://neon.tech) 데이터베이스 | 기사·카테고리·실행 기록 저장 |
| [Clerk](https://clerk.com) 애플리케이션 | 로그인 (혼자 쓰는 문지기) |
| Anthropic API 키 **또는** OpenRouter API 키 | 번역·요약·분류 |
| Notion internal integration + 데이터베이스 | 기사 저장 |

## 설정

### 1. 의존성

```bash
npm install
```

### 2. 환경변수

`.env.example`을 `.env.local`로 복사한 뒤 값을 채웁니다.

```bash
cp .env.example .env.local
```

LLM은 `LLM_PROVIDER`로 고릅니다. `anthropic`(기본)이면 `ANTHROPIC_API_KEY`를,
`openrouter`면 `OPENROUTER_API_KEY`를 채우면 됩니다. 모델은 각각 `ANTHROPIC_MODEL`,
`OPENROUTER_MODEL`로 바꿔가며 비교할 수 있습니다 (OpenRouter 모델 ID는 `anthropic/claude-opus-5-5`
처럼 벤더 접두사가 필요합니다).

### 3. 데이터베이스

```bash
npm run db:migrate   # 테이블 생성
npm run db:seed      # 기본 카테고리 6개 입력
```

### 4. Clerk

Clerk 대시보드에서 **가입(Sign-up)을 비활성화**하고 본인 계정 하나만 남겨 두세요.
이 앱은 단일 사용자 전제라 로그인한 사람은 모두 같은 데이터를 봅니다.

### 5. Notion

노션에서 데이터베이스를 **직접 만들고**, 만든 integration을 그 데이터베이스에 연결(`···` → 연결)한 뒤
URL에서 데이터베이스 ID를 꺼내 `NOTION_DATABASE_ID`에 넣습니다.

데이터베이스에는 아래 속성이 **이 이름, 이 타입 그대로** 있어야 합니다:

| 속성 이름 | 타입 |
|---|---|
| 제목 | Title |
| 카테고리 | Select |
| 출처 | Select |
| 원문 링크 | URL |
| 발행일 | Date |
| 저장일 | Date |

설정 화면의 `연결 상태 점검` 버튼이 토큰·접근 권한·속성 구성을 한 번에 확인해 줍니다.

### 6. 실행

```bash
npm run dev     # http://localhost:3000
```

## 명령어

```bash
npm run dev          # 개발 서버
npm run build        # 프로덕션 빌드 (타입 검사 포함)
npm run lint         # eslint
npm run db:generate  # 스키마 변경 → 마이그레이션 SQL 생성
npm run db:migrate   # 마이그레이션 적용
npm run db:seed      # 기본 카테고리 입력
```

테스트 러너는 아직 없습니다.

## 동작 방식

`뉴스 가져오기` 버튼은 두 단계로 나뉘어 있습니다.

1. **수집** — 두 피드를 읽어 새 기사(`url` 기준 중복 제거)만 `pending` 상태로 저장하고 바로 응답합니다.
2. **요약** — 응답이 나간 뒤 서버가 `next/server`의 `after()`로 LLM 호출을 이어서 돌립니다.
   피드 화면은 남은 `pending` 건수를 3초마다 확인하며 카드를 하나씩 채웁니다.

한 피드가 죽거나 한 기사의 요약이 실패해도 나머지는 계속 진행되고, 실패 건은 다음 수집이나
설정 화면의 `실패 건 재시도`로 다시 처리됩니다.

## 구조

```
src/
  app/            화면(/, /settings, /sign-in)과 API 라우트
  components/     Feed, ArticleCard, Settings, Header
  db/             Drizzle 스키마 · 클라이언트 · 시드
  lib/
    llm/          프로바이더 전환(anthropic | openrouter) + 공용 프롬프트
    collect.ts    수집·요약 오케스트레이션
    rss.ts        RSS 2.0 / Atom 파서
    notion.ts     Notion 저장 및 연결 점검
proxy.ts          Clerk 인증 (Next.js 16에서 middleware의 새 이름)
```

## 알려진 제약

- **TechCrunch 피드는 본문을 주지 않습니다.** 한 문장짜리 `description`과 제목이 전부라서
  요약의 재료가 얇습니다. The Verge는 700자 안팎을 실어 줍니다. 원문 스크래핑은 PRD에서
  범위 밖으로 둔 상태입니다.
- **TechCrunch 피드에는 이미지가 없습니다.** 카드 썸네일은 The Verge 기사에만 붙습니다.
