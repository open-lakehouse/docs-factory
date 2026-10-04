// Consent step of `review-feedback login` (/cli-auth). The CLI opens this page
// with a loopback port + state. On approval we mint a token and hand it back to
// http://127.0.0.1:<port>/callback, the CLI's one-shot listener. AccessGate has
// already made the viewer sign in, and sign-in returns to this exact URL.

import { useMutation } from "@connectrpc/connect-query";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { createApiToken } from "../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { cliCallbackUrl, FEEDBACK_SCOPES, parseCliLogin, SCOPE_LABELS } from "../lib/agent-tokens";
import { useAuth } from "../lib/auth-context";

export default function CliAuth() {
  const [params] = useSearchParams();
  const { viewer } = useAuth();
  const request = parseCliLogin(params);
  const create = useMutation(createApiToken);
  const [denied, setDenied] = useState(false);

  if (!request) {
    return (
      <div className="cli-auth-card">
        <h1>Invalid login request</h1>
        <p className="muted">
          Run <code>review-feedback login</code> again. This page only works when the CLI opens it.
        </p>
      </div>
    );
  }

  async function approve() {
    if (!request) return;
    const res = await create.mutateAsync({ name: request.name, scopes: FEEDBACK_SCOPES });
    window.location.assign(cliCallbackUrl(request, res.token));
  }

  if (denied) {
    return (
      <div className="cli-auth-card">
        <h1>Login cancelled</h1>
        <p className="muted">No token was created. You can close this tab.</p>
      </div>
    );
  }

  return (
    <div className="cli-auth-card">
      <h1>Authorize review-feedback</h1>
      <p>
        <strong>{request.name}</strong> on this machine wants a token to act as{" "}
        <strong>{viewer?.login}</strong>. It will be able to:
      </p>
      <ul>
        {FEEDBACK_SCOPES.map((s) => (
          <li key={s}>{SCOPE_LABELS[s]}</li>
        ))}
      </ul>
      <p className="muted">
        The token expires in 90 days. You can revoke it any time under Agent tokens.
      </p>
      {create.error && <p className="admin-error">{create.error.message}</p>}
      <div className="admin-row-actions" style={{ justifyContent: "flex-start" }}>
        <Button type="button" size="sm" disabled={create.isPending} onClick={() => void approve()}>
          Authorize
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setDenied(true)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
