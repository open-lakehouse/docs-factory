import { type Client, Code, ConnectError, createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import type { ResolvedConfig } from "./config.js";
import { ReviewService } from "./gen/docs_factory/review/v1/review_service_pb.js";

export type ReviewClient = Client<typeof ReviewService>;

export function reviewClient(config: ResolvedConfig): ReviewClient {
  const transport = createConnectTransport({
    baseUrl: config.apiUrl,
    httpVersion: "1.1",
    interceptors: [
      (next) => async (req) => {
        if (config.token) req.header.set("authorization", `Bearer ${config.token}`);
        return next(req);
      },
    ],
  });
  return createClient(ReviewService, transport);
}

/**
 * A one-line, actionable message for an RPC failure. Auth problems point at
 * `login` because that's the only fix an agent can relay to its user.
 */
export function describeError(e: unknown): string {
  const err = ConnectError.from(e);
  if (err.code === Code.Unauthenticated) {
    return `${err.rawMessage}. Run \`review-feedback login\` to get a new token.`;
  }
  if (err.code === Code.PermissionDenied) {
    return `${err.rawMessage}. The token's owner may lack access to this content.`;
  }
  if (err.code === Code.Unavailable || err.code === Code.Unknown) {
    return `review API unreachable (${err.rawMessage})`;
  }
  return err.rawMessage;
}
