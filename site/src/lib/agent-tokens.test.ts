import { describe, expect, test } from "bun:test";
import { cliCallbackUrl, parseCliLogin } from "./agent-tokens";

const STATE = "abcdefghijklmnop1234";

describe("parseCliLogin", () => {
  test("accepts a loopback port + state, defaulting the name", () => {
    expect(parseCliLogin(new URLSearchParams({ port: "53123", state: STATE }))).toEqual({
      port: 53123,
      state: STATE,
      name: "review-feedback CLI",
    });
  });

  test("rejects anything that isn't a plain unprivileged port", () => {
    for (const port of ["", "80", "70000", "1234x", "evil.com:443", "-1"]) {
      expect(parseCliLogin(new URLSearchParams({ port, state: STATE }))).toBeNull();
    }
  });

  test("rejects a short or non-url-safe state", () => {
    expect(parseCliLogin(new URLSearchParams({ port: "5000", state: "short" }))).toBeNull();
    expect(parseCliLogin(new URLSearchParams({ port: "5000", state: `${STATE}&x=1` }))).toBeNull();
  });
});

test("cliCallbackUrl always targets 127.0.0.1", () => {
  const url = new URL(cliCallbackUrl({ port: 5000, state: STATE, name: "n" }, "dfr_x"));
  expect(url.host).toBe("127.0.0.1:5000");
  expect(url.searchParams.get("token")).toBe("dfr_x");
  expect(url.searchParams.get("state")).toBe(STATE);
});
