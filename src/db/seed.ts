import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

/** PRD §5 F4 — the starting set. Everything here is editable in the app. */
const SEED = [
  { name: "모델/연구", hint: "새 모델 출시, 논문, 벤치마크, 기술적 돌파", sortOrder: 1 },
  { name: "제품/출시", hint: "소비자·개발자용 제품, 기능 업데이트, 앱", sortOrder: 2 },
  { name: "기업/투자", hint: "투자 유치, 인수합병, 인사, 실적", sortOrder: 3 },
  { name: "정책/규제", hint: "법안, 규제, 소송, 저작권", sortOrder: 4 },
  { name: "인프라/칩", hint: "GPU, 데이터센터, 반도체, 클라우드", sortOrder: 5 },
  {
    name: "기타",
    hint: "위 어디에도 맞지 않는 경우",
    sortOrder: 99,
    isFallback: true,
  },
];

async function main() {
  // Imported after dotenv so DATABASE_URL is in place.
  const { db } = await import("./index");
  const { categories } = await import("./schema");

  const inserted = await db
    .insert(categories)
    .values(SEED)
    .onConflictDoNothing({ target: categories.name })
    .returning({ name: categories.name });

  console.log(
    inserted.length
      ? `Seeded categories: ${inserted.map((c) => c.name).join(", ")}`
      : "Categories already seeded — nothing to do.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
