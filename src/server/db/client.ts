import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

// Supabase's pooled connection (pgbouncer) doesn't support prepared statements.
// The timeouts matter on Vercel: a function instance that sat frozen between requests can wake up
// holding a connection the pooler already closed, and without these a query on it just hangs until
// the function's 120s limit ("This request timed out"). Failing to connect fast, and not keeping
// idle or old connections around, lets the next call open a fresh one instead.
const client = postgres(process.env.DATABASE_URL, {
  prepare: false,
  connect_timeout: 10,
  idle_timeout: 20,
  max_lifetime: 60 * 5,
});

export const db = drizzle(client, { schema });
