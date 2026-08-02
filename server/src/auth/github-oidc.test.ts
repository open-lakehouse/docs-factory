// Unit tests for the GitHub Actions OIDC verification + pin. Run with `bun test`.
// We mint EdDSA tokens with a local key pair and verify against that same key
// set, so there's no network/JWKS dependency (the real issuer is a fixed GitHub
// URL; here we only exercise the signature/claim logic, not GitHub's JWKS).
import { afterEach, describe, expect, test } from "bun:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  assertRegisterAllowed,
  GITHUB_OIDC_JWKS_URL,
  type GithubOidcClaims,
  isRegisterDevOpen,
  REGISTER_AUDIENCE,
  verifyGithubOidcWith,
} from "./github-oidc.js";

const ISSUER = "https://token.actions.githubusercontent.com";
const REPO = "roeap/docs-factory";

const { publicKey, privateKey } = await generateKeyPair("EdDSA");
const jwk = await exportJWK(publicKey);
const keys = createLocalJWKSet({ keys: [{ ...jwk, alg: "EdDSA" }] });

function mint(
  claims: Record<string, unknown>,
  opts?: { iss?: string; aud?: string; exp?: string },
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "EdDSA" })
    .setIssuedAt()
    .setIssuer(opts?.iss ?? ISSUER)
    .setAudience(opts?.aud ?? REGISTER_AUDIENCE)
    .setExpirationTime(opts?.exp ?? "5m")
    .sign(privateKey);
}

describe("GITHUB_OIDC_JWKS_URL", () => {
  // Regression guard: GitHub's jwks_uri is `/.well-known/jwks`, NOT `.../jwks.json`
  // (the `.json` path 404s, which made createRemoteJWKSet fail and every token
  // verification throw). Keep the endpoint exactly `/.well-known/jwks`.
  test("uses GitHub's real jwks_uri path (no .json suffix)", () => {
    expect(GITHUB_OIDC_JWKS_URL).toBe(
      "https://token.actions.githubusercontent.com/.well-known/jwks",
    );
    expect(GITHUB_OIDC_JWKS_URL.endsWith(".json")).toBe(false);
  });
});

describe("verifyGithubOidcWith", () => {
  test("verifies a well-formed token and extracts repository/environment/ref/sub", async () => {
    const token = await mint({
      sub: "repo:roeap/docs-factory:environment:production",
      repository: REPO,
      environment: "production",
      ref: "refs/heads/main",
    });
    expect(await verifyGithubOidcWith(token, keys)).toEqual({
      sub: "repo:roeap/docs-factory:environment:production",
      repository: REPO,
      environment: "production",
      ref: "refs/heads/main",
    });
  });

  test("rejects a wrong issuer", async () => {
    const token = await mint({ sub: "s", repository: REPO }, { iss: "https://evil.example.com" });
    expect(await verifyGithubOidcWith(token, keys)).toBeNull();
  });

  test("rejects a wrong audience", async () => {
    const token = await mint({ sub: "s", repository: REPO }, { aud: "some-other-audience" });
    expect(await verifyGithubOidcWith(token, keys)).toBeNull();
  });

  test("rejects an expired token", async () => {
    const token = await mint({ sub: "s", repository: REPO }, { exp: "-1m" });
    expect(await verifyGithubOidcWith(token, keys)).toBeNull();
  });

  test("rejects a token with no repository claim", async () => {
    const token = await mint({ sub: "s" });
    expect(await verifyGithubOidcWith(token, keys)).toBeNull();
  });

  test("rejects a non-JWT bearer", async () => {
    expect(await verifyGithubOidcWith("not-a-jwt", keys)).toBeNull();
  });
});

describe("assertRegisterAllowed", () => {
  const OLD = { repo: process.env.OIDC_ALLOWED_REPO, envs: process.env.OIDC_ALLOWED_ENVIRONMENTS };
  afterEach(() => {
    process.env.OIDC_ALLOWED_REPO = OLD.repo;
    process.env.OIDC_ALLOWED_ENVIRONMENTS = OLD.envs;
  });

  const claims = (over: Partial<GithubOidcClaims> = {}): GithubOidcClaims => ({
    sub: "s",
    repository: REPO,
    environment: "production",
    ref: "refs/heads/main",
    ...over,
  });

  test("accepts the pinned repo + a production-environment token", () => {
    process.env.OIDC_ALLOWED_REPO = REPO;
    process.env.OIDC_ALLOWED_ENVIRONMENTS = "production";
    expect(() => assertRegisterAllowed(claims())).not.toThrow();
  });

  test("rejects a token from a different repo", () => {
    process.env.OIDC_ALLOWED_REPO = REPO;
    process.env.OIDC_ALLOWED_ENVIRONMENTS = "production";
    expect(() => assertRegisterAllowed(claims({ repository: "attacker/fork" }))).toThrow(
      /repository/,
    );
  });

  test("rejects a token with no environment claim", () => {
    process.env.OIDC_ALLOWED_REPO = REPO;
    process.env.OIDC_ALLOWED_ENVIRONMENTS = "production";
    expect(() => assertRegisterAllowed(claims({ environment: undefined }))).toThrow(/environment/);
  });

  test("rejects when the pin config is unset (server misconfigured)", () => {
    delete process.env.OIDC_ALLOWED_REPO;
    delete process.env.OIDC_ALLOWED_ENVIRONMENTS;
    expect(() => assertRegisterAllowed(claims())).toThrow(/not configured/);
  });

  test("environment allowlist is config-only: preview rejected under production, accepted once added", () => {
    process.env.OIDC_ALLOWED_REPO = REPO;
    process.env.OIDC_ALLOWED_ENVIRONMENTS = "production";
    expect(() => assertRegisterAllowed(claims({ environment: "preview" }))).toThrow(/environment/);
    // Add preview to the allowlist — no code change, just config.
    process.env.OIDC_ALLOWED_ENVIRONMENTS = "production,preview";
    expect(() => assertRegisterAllowed(claims({ environment: "preview" }))).not.toThrow();
  });
});

describe("isRegisterDevOpen", () => {
  const OLD = {
    repo: process.env.OIDC_ALLOWED_REPO,
    envs: process.env.OIDC_ALLOWED_ENVIRONMENTS,
    node: process.env.NODE_ENV,
  };
  afterEach(() => {
    process.env.OIDC_ALLOWED_REPO = OLD.repo;
    process.env.OIDC_ALLOWED_ENVIRONMENTS = OLD.envs;
    process.env.NODE_ENV = OLD.node;
  });

  test("dev-open when no pin configured and not production", () => {
    delete process.env.OIDC_ALLOWED_REPO;
    delete process.env.OIDC_ALLOWED_ENVIRONMENTS;
    process.env.NODE_ENV = "development";
    expect(isRegisterDevOpen()).toBe(true);
  });

  test("NOT dev-open in production even with no pin", () => {
    delete process.env.OIDC_ALLOWED_REPO;
    delete process.env.OIDC_ALLOWED_ENVIRONMENTS;
    process.env.NODE_ENV = "production";
    expect(isRegisterDevOpen()).toBe(false);
  });

  test("NOT dev-open once the pin is configured", () => {
    process.env.OIDC_ALLOWED_REPO = REPO;
    process.env.OIDC_ALLOWED_ENVIRONMENTS = "production";
    process.env.NODE_ENV = "development";
    expect(isRegisterDevOpen()).toBe(false);
  });
});
