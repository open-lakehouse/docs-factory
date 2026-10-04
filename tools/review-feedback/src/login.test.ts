import { expect, test } from "bun:test";
import { browserLogin } from "./login.js";

/** Plays the site's part: follow /cli-auth's params back to the loopback callback. */
function fakeSite(token: (state: string) => { token: string; state: string }) {
  return (url: string) => {
    const u = new URL(url);
    const port = u.searchParams.get("port");
    const q = new URLSearchParams(token(u.searchParams.get("state") ?? ""));
    void fetch(`http://127.0.0.1:${port}/callback?${q}`);
  };
}

test("resolves with the token the site hands back for this run's state", async () => {
  const token = await browserLogin(
    "https://review.example.com/",
    () => {},
    fakeSite((state) => ({ token: "dfr_abc", state })),
  );
  expect(token).toBe("dfr_abc");
});

test("ignores a callback with the wrong state", async () => {
  let opened = "";
  const login = browserLogin(
    "https://review.example.com",
    () => {},
    (url) => {
      opened = url;
      fakeSite(() => ({ token: "dfr_evil", state: "not-the-state" }))(url);
      // Then the genuine redirect.
      setTimeout(() => fakeSite((state) => ({ token: "dfr_good", state }))(url), 50);
    },
  );
  expect(await login).toBe("dfr_good");
  expect(opened.startsWith("https://review.example.com/cli-auth?")).toBe(true);
});
