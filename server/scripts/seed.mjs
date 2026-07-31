// Apply db/seed/*.sql in filename order against DATABASE_URL — LOCAL DEV ONLY.
// Unlike migrate.mjs these are not tracked in schema_migrations; every seed file
// is written to be idempotent (`on conflict do nothing`) so re-running is safe.
// user_identity.sql must sort before allowlist.sql (the allowlist FKs it), which
// it does alphabetically after the `a`/`u`… no — allowlist < user_identity, so
// we apply an explicit order below rather than relying on the sort.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const here = dirname(fileURLToPath(import.meta.url));
const seedDir = resolve(here, "../db/seed");

function resolveUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const { PGUSER, PGPASSWORD, PGHOST, PGPORT, PGDATABASE } = process.env;
  if (PGUSER && PGHOST && PGDATABASE) {
    const auth = PGPASSWORD ? `${PGUSER}:${PGPASSWORD}` : PGUSER;
    return `postgres://${auth}@${PGHOST}:${PGPORT ?? "5432"}/${PGDATABASE}`;
  }
  return undefined;
}

const url = resolveUrl();
if (!url) {
  console.error(
    "No database connection. Set DATABASE_URL or the PG* parts " +
      "(copy server/.env.example to server/.env).",
  );
  process.exit(1);
}

// Explicit order: user_identity rows must exist before the allowlist FKs them.
const files = ["user_identity.sql", "allowlist.sql"];
const sql = postgres(url, { max: 1 });
try {
  for (const file of files) {
    const ddl = readFileSync(join(seedDir, file), "utf8");
    await sql.unsafe(ddl);
    console.log(`seed  ${file}`);
  }
  console.log(`Seeded ${files.length} file(s).`);
} finally {
  await sql.end();
}
