import { execFileSync } from "node:child_process";

/** The checkout containing `cwd` (works from worktrees too), or undefined outside git. */
export function repoRoot(cwd = process.cwd()): string | undefined {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" }).trim();
  } catch {
    return undefined;
  }
}
