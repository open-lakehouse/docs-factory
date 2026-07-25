/**
 * Node-only line hashing for the content pipeline.
 *
 * Split out from normalize.mjs deliberately: normalize.mjs is on the BROWSER
 * import path (site/src/lib/content-ref.ts re-exports normalizeText/fingerprint
 * from it), and Vite externalizes `node:crypto` for the browser — a top-level
 * `node:crypto` import there crashes the client at load. This module keeps the
 * `node:crypto` dependency isolated to the build/server side (the version
 * manifest and drift test), so the browser never pulls it in. The browser has
 * its own async SubtleCrypto equivalent (content-ref.ts hashLine).
 */
import { createHash } from "node:crypto";

/**
 * Hash of a single source line for code re-anchoring: sha256 of the line with
 * BOTH leading and trailing whitespace trimmed, first 16 hex chars. Trimming
 * leading whitespace makes the hash dedent-invariant: the browser hashes the
 * rendered (dedented) line while the server re-anchor hashes the full indented
 * source line, so both must ignore indentation to agree. Matches the browser's
 * async SubtleCrypto implementation (content-ref.ts hashLine) and the server's
 * anchor.ts hashLine; a drift test asserts all three agree.
 */
export function hashLineSync(line) {
  return createHash("sha256").update(line.trim()).digest("hex").slice(0, 16);
}
