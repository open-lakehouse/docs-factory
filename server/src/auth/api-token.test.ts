// Personal access tokens: scope rules, the provider wrapper, and end-to-end
// enforcement through the real ReviewService router (no DB: every case either
// short-circuits in authInterceptor or hits a handler that needs none).
import { describe, expect, test } from "bun:test";
import { create } from "@bufbuild/protobuf";
import { Code, ConnectError, createClient, createRouterTransport } from "@connectrpc/connect";
import type { Queryable } from "../db.js";
import {
  ContentArea,
  ContentRefSchema,
  Role,
  type Viewer,
} from "../gen/docs_factory/review/v1/messages_pb.js";
import { ReviewService } from "../gen/docs_factory/review/v1/review_service_pb.js";
import { registerReviewService } from "../services/review.js";
import {
  apiTokenFromHeader,
  generateToken,
  hashToken,
  SCOPE_READ,
  SCOPE_REPLY,
  TOKEN_PREFIX,
  tokenMayCall,
  withApiTokens,
} from "./api-token.js";
import { type AuthProvider, anonymousViewer, viewer } from "./provider.js";

const BOTH = [SCOPE_READ, SCOPE_REPLY];

describe("tokenMayCall", () => {
  test("read scope admits the read RPCs only", () => {
    for (const m of ["GetViewer", "ListDrafts", "ListComments", "GetSourceFile"]) {
      expect(tokenMayCall(m, {}, [SCOPE_READ])).toBe(true);
      expect(tokenMayCall(m, {}, [SCOPE_REPLY])).toBe(false);
    }
  });

  test("reply scope admits CreateComment only as a reply", () => {
    expect(tokenMayCall("CreateComment", { parentId: "c1" }, BOTH)).toBe(true);
    expect(tokenMayCall("CreateComment", { parentId: "c1" }, [SCOPE_READ])).toBe(false);
    expect(tokenMayCall("CreateComment", {}, BOTH)).toBe(false);
    expect(tokenMayCall("CreateComment", { parentId: "" }, BOTH)).toBe(false);
  });

  test("everything else is denied regardless of scope", () => {
    for (const m of [
      "ResolveThread",
      "RecordApproval",
      "ReleaseContent",
      "ManageAllowlist",
      "CreateApiToken",
      "ListApiTokens",
      "RevokeApiToken",
      "RegisterVersion",
    ]) {
      expect(tokenMayCall(m, { parentId: "c1" }, BOTH)).toBe(false);
    }
  });
});

describe("token format", () => {
  test("generateToken returns a dfr_ secret whose hash and prefix match", () => {
    const { token, hash, prefix } = generateToken();
    expect(token.startsWith(TOKEN_PREFIX)).toBe(true);
    expect(hash).toBe(hashToken(token));
    expect(token.slice(TOKEN_PREFIX.length).startsWith(prefix)).toBe(true);
    expect(generateToken().token).not.toBe(token);
  });

  test("apiTokenFromHeader only picks up dfr_ bearers", () => {
    const h = (v: string) => new Headers({ authorization: v });
    expect(apiTokenFromHeader(h("Bearer dfr_abc"))).toBe("dfr_abc");
    expect(apiTokenFromHeader(h("bearer  dfr_abc "))).toBe("dfr_abc");
    expect(apiTokenFromHeader(h("Bearer eyJhbGciOi.jwt"))).toBeUndefined();
    expect(apiTokenFromHeader(new Headers())).toBeUndefined();
  });
});

/** A fake `sql` tag: answers the token lookup with `rows`, records hashes. */
function fakeSql(rows: object[]) {
  const lookedUp: unknown[] = [];
  const tag = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    if (strings.join("?").includes("from api_token")) {
      lookedUp.push(values[0]);
      return Promise.resolve(rows);
    }
    return Promise.resolve([]); // last_used_at bump
  }) as unknown as Queryable;
  return { tag, lookedUp };
}

const sessionInner: AuthProvider = {
  async verify(header) {
    return header.get("authorization") === "Bearer session-jwt"
      ? viewer("human", Role.REVIEWER, { userId: "u-human" })
      : anonymousViewer();
  },
};

const ownerRow = {
  id: "t1",
  user_id: "u-owner",
  scopes: BOTH,
  github_login: "owner",
  name: "Owner",
};

/** The owner's viewer as the session path would build it (here: allowlisted reviewer). */
async function ownerViewer(owner: { userId: string; login: string; name?: string }) {
  return viewer(owner.login, Role.REVIEWER, { userId: owner.userId, name: owner.name });
}

describe("withApiTokens", () => {
  test("non-token bearers go to the inner provider", async () => {
    const { tag, lookedUp } = fakeSql([ownerRow]);
    const auth = withApiTokens(sessionInner, ownerViewer, () => tag);
    const authn = await auth.authenticate?.(new Headers({ authorization: "Bearer session-jwt" }));
    expect(authn?.viewer.login).toBe("human");
    expect(authn?.token).toBeUndefined();
    expect(lookedUp.length).toBe(0);
  });

  test("a valid token resolves to its owner, flagged via_agent, with scopes", async () => {
    const { tag, lookedUp } = fakeSql([ownerRow]);
    const auth = withApiTokens(sessionInner, ownerViewer, () => tag);
    const authn = await auth.authenticate?.(new Headers({ authorization: "Bearer dfr_secret" }));
    expect(lookedUp[0]).toBe(hashToken("dfr_secret"));
    expect(authn?.viewer.login).toBe("owner");
    expect(authn?.viewer.userId).toBe("u-owner");
    expect(authn?.viewer.viaAgent).toBe(true);
    expect(authn?.token).toEqual({ tokenId: "t1", scopes: BOTH });
  });

  test("an unknown/expired/revoked token is invalid, not anonymous fallthrough", async () => {
    const { tag } = fakeSql([]);
    const auth = withApiTokens(sessionInner, ownerViewer, () => tag);
    const authn = await auth.authenticate?.(new Headers({ authorization: "Bearer dfr_nope" }));
    expect(authn?.invalidToken).toBe(true);
    expect(authn?.viewer.authenticated).toBe(false);
  });

  test("the owner's live role is what the token gets (no stored role)", async () => {
    const { tag } = fakeSql([ownerRow]);
    const revoked = async (o: { userId: string; login: string }) =>
      viewer(o.login, Role.ANONYMOUS, { userId: o.userId });
    const auth = withApiTokens(sessionInner, revoked, () => tag);
    const v = await auth.verify(new Headers({ authorization: "Bearer dfr_secret" }));
    expect(v.isAllowlisted).toBe(false);
  });
});

/** A client over the real router with a stubbed token/session provider. */
function clientWith(grant: { scopes: string[] } | "invalid" | null, v: Viewer) {
  const auth: AuthProvider = {
    async verify() {
      return v;
    },
    async authenticate() {
      if (grant === "invalid") return { viewer: anonymousViewer(), invalidToken: true };
      return grant ? { viewer: v, token: { tokenId: "t1", ...grant } } : { viewer: v };
    },
  };
  const transport = createRouterTransport((router) => registerReviewService(router, auth));
  return createClient(ReviewService, transport);
}

async function codeOf(p: Promise<unknown>): Promise<Code | "ok"> {
  try {
    await p;
    return "ok";
  } catch (e) {
    return ConnectError.from(e).code;
  }
}

describe("authInterceptor token enforcement", () => {
  const owner = viewer("owner", Role.MAINTAINER, { userId: "u-owner" });
  const ref = create(ContentRefSchema, { area: ContentArea.BLOGS, slug: "x" });

  test("read RPCs pass with feedback:read", async () => {
    const res = await clientWith({ scopes: [SCOPE_READ] }, owner).getViewer({});
    expect(res.viewer?.login).toBe("owner");
  });

  test("resolve is denied even for a maintainer's token", async () => {
    const c = clientWith({ scopes: BOTH }, owner);
    expect(await codeOf(c.resolveThread({ threadRootId: "r1" }))).toBe(Code.PermissionDenied);
  });

  test("opening a new thread is denied; only replies are allowed", async () => {
    const c = clientWith({ scopes: BOTH }, owner);
    const top = c.createComment({ ref, anchorSlug: "a", anchorFingerprint: "a", bodyMd: "hi" });
    expect(await codeOf(top)).toBe(Code.PermissionDenied);
  });

  test("tokens can't manage tokens", async () => {
    const c = clientWith({ scopes: BOTH }, owner);
    expect(await codeOf(c.createApiToken({ name: "n", scopes: BOTH }))).toBe(Code.PermissionDenied);
    expect(await codeOf(c.listApiTokens({}))).toBe(Code.PermissionDenied);
  });

  test("an invalid token is Unauthenticated", async () => {
    const c = clientWith("invalid", anonymousViewer());
    expect(await codeOf(c.getViewer({}))).toBe(Code.Unauthenticated);
  });

  test("session callers are unaffected by token rules", async () => {
    const c = clientWith(null, owner);
    // Reaches the handler (which validates input before touching the DB).
    expect(await codeOf(c.createApiToken({ name: " ", scopes: BOTH }))).toBe(Code.InvalidArgument);
  });
});
