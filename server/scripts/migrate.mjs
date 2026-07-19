// Apply db/migrations/*.sql in filename order against DATABASE_URL. Idempotent:
// each migration's filename is recorded in a schema_migrations table and skipped
// if already applied. Run via `just db-migrate`.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(here, "../db/migrations");

// Resolve DATABASE_URL directly or compose from PG* parts (matches src/db.ts),
// so no connection string literal lives in a tracked file.
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

const sql = postgres(url, { max: 1 });

try {
  await sql`
    create table if not exists schema_migrations (
      filename   text primary key,
      applied_at timestamptz not null default now()
    )
  `;
  const applied = new Set(
    (await sql`select filename from schema_migrations`).map((r) => r.filename),
  );
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip  ${file} (already applied)`);
      continue;
    }
    const ddl = readFileSync(join(migrationsDir, file), "utf8");
    // Each migration runs in its own transaction; the whole file is one unit.
    await sql.begin(async (tx) => {
      await tx.unsafe(ddl);
      await tx`insert into schema_migrations (filename) values (${file})`;
    });
    console.log(`apply ${file}`);
    ran++;
  }
  console.log(ran === 0 ? "Up to date." : `Applied ${ran} migration(s).`);
} finally {
  await sql.end();
}
