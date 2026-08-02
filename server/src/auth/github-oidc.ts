// Build-time auth for RegisterVersion: a GitHub Actions OIDC token.
//
// The register step runs on a GitHub runner that declares `permissions:
// id-token: write`, so GitHub mints a short-lived, EdDSA/RS256-signed JWT whose
// claims (repository, ref, environment, sub, …) are signed by GitHub and cannot
// be forged. We verify it the same stateless way as the Neon Auth path: check
// the signature against GitHub's JWKS and validate iss/aud/exp, then trust the
// claims. This replaces the old tracked shared secret (BUILD_SECRET) — there's
// nothing to rotate or leak.
//
// Trust model: the claim VALUES are public, so a valid GitHub OIDC token from
// ANY repo would pass signature/iss/aud checks. So on top of verification we PIN
// the claims to this repo + an allowlisted set of deployment environments
// (OIDC_ALLOWED_REPO / OIDC_ALLOWED_ENVIRONMENTS, set on the Function at deploy).
// This is the standard cloud-OIDC pattern (how AWS/GCP/Vercel gate GitHub OIDC).
//
// The OIDC identity is a WORKFLOW identity, distinct from the interactive
// `github_login` Neon Auth user — it never touches the reviewer allowlist.
import { Code, ConnectError } from "@connectrpc/connect";
import { createRemoteJWKSet, jwtVerify } from "jose";

// GitHub's OIDC issuer is a fixed, well-known constant.
const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";

// GitHub's JWKS endpoint. NOTE: it is `/.well-known/jwks`, NOT `.../jwks.json`
// (the `.json` path 404s) — this is the `jwks_uri` from the issuer's
// openid-configuration. Getting this wrong makes createRemoteJWKSet fail to fetch
// keys and every verification throw, surfacing as "invalid GitHub OIDC token".
export const GITHUB_OIDC_JWKS_URL = `${GITHUB_OIDC_ISSUER}/.well-known/jwks`;

// The audience we mint the token with on the runner and verify here. A fixed
// string (not the Function URL, which the register script may not know) — GitHub
// lets the workflow request an arbitrary `audience` for the token.
export const REGISTER_AUDIENCE = "docs-factory-register";

/** The subset of GitHub OIDC claims we rely on. */
export interface GithubOidcClaims {
  /** "owner/repo" — the repository the workflow ran in. */
  repository: string;
  /** The deployment environment the job declared (`environment:`), if any. */
  environment?: string;
  /** The git ref that triggered the run (e.g. refs/heads/main). */
  ref?: string;
  /** The workflow-identity subject. */
  sub: string;
}

// Remote JWKS, created once and cached (jose refetches on unknown `kid`, with its
// own cooldown). GitHub's issuer is constant, so a single module-level handle.
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
function getJwks() {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(GITHUB_OIDC_JWKS_URL));
  }
  return jwks;
}

/**
 * Verify `token` as a GitHub Actions OIDC JWT: signature (via GitHub's JWKS),
 * issuer, audience, and expiry. Returns the trusted claims, or null on any
 * failure (bad signature, expired, wrong iss/aud, not a JWT) so the caller
 * rejects the request. Does NOT enforce the repo/environment pin — that's
 * assertRegisterAllowed, kept separate so it's unit-testable against config.
 */
export async function verifyGithubOidc(token: string): Promise<GithubOidcClaims | null> {
  return verifyGithubOidcWith(token, getJwks());
}

/**
 * The testable core of verifyGithubOidc: verify `token` against `keys` with the
 * fixed GitHub issuer + REGISTER_AUDIENCE. Exported for unit tests, which pass a
 * locally-generated key set.
 */
export async function verifyGithubOidcWith(
  token: string,
  keys: Parameters<typeof jwtVerify>[1],
): Promise<GithubOidcClaims | null> {
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer: GITHUB_OIDC_ISSUER,
      audience: REGISTER_AUDIENCE,
    });
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    if (typeof payload.repository !== "string" || !payload.repository) return null;
    return {
      sub: payload.sub,
      repository: payload.repository,
      environment: typeof payload.environment === "string" ? payload.environment : undefined,
      ref: typeof payload.ref === "string" ? payload.ref : undefined,
    };
  } catch (err) {
    // Signature/exp/iss/aud failure, JWKS fetch failure, or a raw opaque token
    // that isn't a JWT. Log the reason (no token) so a rejection is diagnosable
    // in the Function logs — the caller only sees a generic "invalid" error.
    console.warn(`[github-oidc] token verification failed: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`);
    return null;
  }
}

/** Parse a comma-separated allowlist env var into a trimmed, non-empty set. */
function parseCsv(v: string | undefined): string[] {
  return (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Enforce the repo + environment pin on already-verified OIDC claims. Throws
 * ConnectError otherwise:
 *   - FailedPrecondition if the pin config is unset (mirrors the old
 *     assertBuildSecret unset-config behavior — a misconfigured server, not a
 *     bad caller).
 *   - PermissionDenied if the repository or environment does not match.
 *
 * The environment allowlist is config, not code: ship it as `production` and add
 * `preview` later (when preview registration is wired) with no code change.
 */
export function assertRegisterAllowed(claims: GithubOidcClaims): void {
  const allowedRepo = process.env.OIDC_ALLOWED_REPO?.trim();
  const allowedEnvs = parseCsv(process.env.OIDC_ALLOWED_ENVIRONMENTS);
  if (!allowedRepo || allowedEnvs.length === 0) {
    throw new ConnectError(
      "OIDC_ALLOWED_REPO / OIDC_ALLOWED_ENVIRONMENTS are not configured on the server",
      Code.FailedPrecondition,
    );
  }
  if (claims.repository !== allowedRepo) {
    throw new ConnectError("OIDC token repository is not allowed to register versions", Code.PermissionDenied);
  }
  if (!claims.environment || !allowedEnvs.includes(claims.environment)) {
    throw new ConnectError("OIDC token environment is not allowed to register versions", Code.PermissionDenied);
  }
}

/**
 * True when the server is running dev-open: no OIDC pin configured AND not
 * production. In that mode RegisterVersion skips OIDC verification so local
 * `bun run register-versions` works without minting a token — the same spirit as
 * the mock auth provider that is refused in production.
 */
export function isRegisterDevOpen(): boolean {
  const configured = !!process.env.OIDC_ALLOWED_REPO?.trim() && parseCsv(process.env.OIDC_ALLOWED_ENVIRONMENTS).length > 0;
  return !configured && process.env.NODE_ENV !== "production";
}
