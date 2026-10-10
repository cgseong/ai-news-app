import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";

import * as schema from "./schema";

type Database = NeonHttpDatabase<typeof schema>;

let instance: Database | null = null;

function getDb(): Database {
  if (instance) return instance;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill in your Neon connection string.",
    );
  }

  instance = drizzle(neon(connectionString), { schema });
  return instance;
}

/**
 * Lazily resolved so that importing this module — which the build does while
 * collecting routes — never fails on a missing connection string. The error
 * surfaces on the first query instead, where it can be reported to the user.
 */
export const db = new Proxy({} as Database, {
  get(_target, property) {
    const database = getDb();
    const value = Reflect.get(database, property) as unknown;
    return typeof value === "function" ? value.bind(database) : value;
  },
});

export { schema };
