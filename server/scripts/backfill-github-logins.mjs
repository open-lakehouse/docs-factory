// Backfill user_identity.github_login for rows that never resolved a handle,
// from the numeric GitHub account id Neon Auth stores in neon_auth.account. The
// app resolves the same way on a user's next request (auth/github-identity.ts);
// this covers users who don't come back. Idempotent: only touches rows whose
// login is still null.
//
//   node scripts/backfill-github-logins.mjs [--dry-run]
//
// Set GITHUB_TOKEN (any token, no scopes) to lift GitHub's 60/h unauthenticated
// limit.
import postgres from "postgres";

const dryRun = process.argv.includes("--dry-run");

function resolveUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const { PGUSER, PGPASSWORD, PGHOST, PGPORT, PGDATABASE } = process.env;
  if (PGUSER && PGHOST && PGDATABASE) {
    const auth = PGPASSWORD ? `${PGUSER}:${PGPASSWORD}` : PGUSER;
    return `postgres://${auth}@${PGHOST}:${PGPORT ?? "5432"}/${PGDATABASE}`;
  }
  return undefined;
}

async function loginForId(id) {
  const headers = { accept: "application/vnd.github+json", "user-agent": "docs-factory-review" };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`https://api.github.com/user/${id}`, { headers });
  if (!res.ok) throw new Error(`GitHub /user/${id}: ${res.status}`);
  const body = await res.json();
  return typeof body.login === "string" && body.login ? body.login : null;
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
  let rows;
  try {
    // Prefer the account id from neon_auth (stub rows from the allowlist grant
    // path have no github_id of their own). neon_auth."user".id is a uuid.
    rows = await sql`
      select ui.user_id, coalesce(ui.github_id, acc."accountId") as github_id
      from user_identity ui
      left join neon_auth.account acc
        on acc."userId"::text = ui.user_id and acc."providerId" = 'github'
      where ui.github_login is null
      order by ui.user_id
    `;
  } catch {
    // No neon_auth schema (local dev): use the stored ids alone.
    rows = await sql`
      select user_id, github_id from user_identity
      where github_login is null order by user_id
    `;
  }

  let resolved = 0;
  for (const { user_id, github_id } of rows) {
    if (!github_id || !/^\d+$/.test(github_id)) {
      console.log(`skip     ${user_id}: no GitHub account id`);
      continue;
    }
    let login;
    try {
      login = await loginForId(github_id);
    } catch (e) {
      console.log(`fail     ${user_id}: ${e.message}`);
      continue;
    }
    if (!login) {
      console.log(`fail     ${user_id}: GitHub returned no login for ${github_id}`);
      continue;
    }
    console.log(`${dryRun ? "would set" : "set     "} ${user_id} -> ${login} (${github_id})`);
    resolved++;
    if (dryRun) continue;
    // Same release-then-upsert order as persistUserIdentity: the login index is
    // unique, and the id is the truth.
    await sql.begin(async (tx) => {
      await tx`
        update user_identity set github_login = null, avatar_url = null, updated_at = now()
        where lower(github_login) = lower(${login}) and user_id <> ${user_id}
      `;
      await tx`
        update user_identity set
          github_login = ${login},
          github_id    = ${github_id},
          avatar_url   = ${`https://github.com/${login}.png`},
          updated_at   = now()
        where user_id = ${user_id}
      `;
    });
  }
  console.log(
    `${rows.length} unresolved row(s); ${dryRun ? "would resolve" : "resolved"} ${resolved}.`,
  );
} finally {
  await sql.end();
}
