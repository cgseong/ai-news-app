import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next.js reads .env.local; drizzle-kit runs outside Next, so load it explicitly.
config({ path: ".env.local" });
config({ path: ".env" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
