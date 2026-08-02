// Mount a Connect ConnectRouter onto a Hono app as fetch-native routes.
//
// Neon Functions expose a Web `fetch(request) => Response` handler and recommend
// Hono; Connect's core produces `UniversalHandler`s, and
// `createFetchHandler` (from @connectrpc/connect/protocol) turns each into a Web
// fetch handler. So we register one POST route per RPC path — no Node
// req/res bridge, no gRPC server. The same mounted app runs unchanged in the
// Neon Function (via app.fetch) and locally (via @hono/node-server).
import { type ConnectRouter, createConnectRouter } from "@connectrpc/connect";
import { createFetchHandler } from "@connectrpc/connect/protocol";
import type { Hono } from "hono";

export type RouteRegistration = (router: ConnectRouter) => void;

/** Register every RPC in `routes` onto `app` at its Connect request path. */
export function mountConnect(app: Hono, routes: RouteRegistration): void {
  const router = createConnectRouter();
  routes(router);
  for (const uHandler of router.handlers) {
    const fetchHandler = createFetchHandler(uHandler);
    // Connect unary RPCs are POST to `/<package>.<Service>/<Method>`.
    app.all(uHandler.requestPath, (c) => fetchHandler(c.req.raw) as Promise<Response>);
  }
}
