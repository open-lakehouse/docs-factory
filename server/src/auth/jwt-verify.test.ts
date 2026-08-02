// Unit tests for the Neon Auth JWT verification core (verifyJwtWith). Run with
// `bun test`. We mint EdDSA tokens with a local key pair and verify against that
// same key set, so there's no network/JWKS dependency.
//
// The key invariant under test is the iss/aud vs. base-path split: Neon Auth's
// JWKS lives under the full auth base path, but the token's iss/aud are the
// base's ORIGIN. verifyJwtWith must validate against the origin, not the path.
import { describe, expect, test } from "bun:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { verifyJwtWith } from "./neon-auth.js";

const BASE = "https://ep-frosty.neonauth.c-4.us-east-2.aws.neon.tech/neondb/auth";
const ORIGIN = "https://ep-frosty.neonauth.c-4.us-east-2.aws.neon.tech";

// A local Ed25519 key pair standing in for Neon Auth's JWKS. createLocalJWKSet
// returns the same resolver shape jwtVerify (and thus verifyJwtWith) expects.
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
    .setIssuer(opts?.iss ?? ORIGIN)
    .setAudience(opts?.aud ?? ORIGIN)
    .setExpirationTime(opts?.exp ?? "5m")
    .sign(privateKey);
}

describe("verifyJwtWith", () => {
  test("verifies a well-formed token and extracts sub/email/name", async () => {
    const token = await mint({
      sub: "2971f957-d8c7-4cf9-a950-42b328fb7a50",
      email: "robert.pack@databricks.com",
      name: "Robert Pack",
    });
    const claims = await verifyJwtWith(token, BASE, keys);
    expect(claims).toEqual({
      sub: "2971f957-d8c7-4cf9-a950-42b328fb7a50",
      email: "robert.pack@databricks.com",
      name: "Robert Pack",
    });
  });

  test("validates iss/aud against the ORIGIN of base, not its full path", async () => {
    // A token issued for the full base path (with /neondb/auth) must be REJECTED —
    // Neon Auth issues iss/aud as the origin, so this guards the split.
    const token = await mint({ sub: "u1" }, { iss: BASE, aud: BASE });
    expect(await verifyJwtWith(token, BASE, keys)).toBeNull();
  });

  test("rejects a wrong issuer", async () => {
    const token = await mint({ sub: "u1" }, { iss: "https://evil.example.com" });
    expect(await verifyJwtWith(token, BASE, keys)).toBeNull();
  });

  test("rejects an expired token", async () => {
    const token = await mint({ sub: "u1" }, { exp: "-1m" });
    expect(await verifyJwtWith(token, BASE, keys)).toBeNull();
  });

  test("rejects a token with no sub", async () => {
    const token = await mint({ email: "x@y.io" });
    expect(await verifyJwtWith(token, BASE, keys)).toBeNull();
  });

  test("rejects a non-JWT bearer (e.g. an opaque token)", async () => {
    expect(await verifyJwtWith("hTyooHkR2zHxKNEwcEXABB5fsoauCmME", BASE, keys)).toBeNull();
  });

  test("returns null when base is not a valid URL", async () => {
    const token = await mint({ sub: "u1" });
    expect(await verifyJwtWith(token, "not a url", keys)).toBeNull();
  });
});
