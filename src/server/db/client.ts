import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}
const databaseUrl = process.env.DATABASE_URL;

type PgClient = ReturnType<typeof postgres>;

// Supabase's pooled connection (pgbouncer) doesn't support prepared statements.
// The timeouts matter on Vercel: a function instance that sat frozen between requests can wake up
// holding a connection the pooler already closed, and without these a query on it just hangs until
// the function's 120s limit ("This request timed out"). Failing to connect fast, and not keeping
// idle or old connections around, lets the next call open a fresh one instead.
function createClient(): PgClient {
  const client = postgres(databaseUrl, {
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 20,
    max_lifetime: 60 * 5,
  });
  // Building a drizzle instance on a client is what installs drizzle's date/json parsers on it, so
  // every replacement client needs this too.
  drizzle(client, { schema });
  return client;
}

// Those timeouts are timers, and timers don't run while Vercel has the instance frozen between
// requests, so they can't catch the connections that die during a freeze: on wake-up the pool
// still hands them out and the query waits (in the logs: several deals timing out at the same
// second). So a pool that hasn't been touched for a few seconds is retired on its next use and a
// fresh one is built. The old pool is drained in the background so a slow query still finishes.
//
// `db` stays one real drizzle instance (the Auth.js adapter type-checks it); only the postgres
// client underneath it is swapped, through a forwarding proxy.
const MAX_IDLE_MS = 4000;
let current = createClient();
let lastUsedAt = Date.now();

function currentClient(): PgClient {
  const now = Date.now();
  if (now - lastUsedAt > MAX_IDLE_MS) {
    const retired = current;
    current = createClient();
    retired.end({ timeout: 60 }).catch(() => {});
  }
  lastUsedAt = now;
  return current;
}

const forwardingClient = new Proxy(function forwardingClient() {} as unknown as PgClient, {
  get(_target, prop) {
    const client = currentClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
  apply(_target, _thisArg, args) {
    return (currentClient() as unknown as (...a: unknown[]) => unknown)(...args);
  },
});

export const db = drizzle(forwardingClient, { schema });
