// Personal access tokens (/tokens) for agents: the review-feedback CLI and MCP
// server authenticate with one of these instead of a browser session. A token
// acts as the viewer, limited to reading and replying. The secret is shown once,
// right after creation.

import { timestampDate } from "@bufbuild/protobuf/wkt";
import { useMutation, useQuery } from "@connectrpc/connect-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Shell from "../components/layout/Shell";
import {
  createApiToken,
  listApiTokens,
  revokeApiToken,
} from "../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { FEEDBACK_SCOPES } from "../lib/agent-tokens";
import { copyToClipboard } from "../lib/clipboard";

function fmtDate(ts: { seconds: bigint } | undefined): string {
  if (!ts) return "never";
  return timestampDate(ts as never).toLocaleDateString();
}

export default function AgentTokens() {
  const { data, refetch } = useQuery(listApiTokens, {});
  const create = useMutation(createApiToken, { onSuccess: () => void refetch() });
  const revoke = useMutation(revokeApiToken, { onSuccess: () => void refetch() });
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await create.mutateAsync({ name: name.trim(), scopes: FEEDBACK_SCOPES });
    setSecret(res.token);
    setCopied(false);
    setName("");
  }

  const tokens = data?.tokens ?? [];
  const error = create.error ?? revoke.error;

  return (
    <Shell>
      <div className="admin-page">
        <h1>Agent tokens</h1>
        <p className="muted">
          Agents like the <code>review-feedback</code> CLI and MCP server use these tokens to read
          review comments and reply to threads as you. Their replies are marked “via agent”. A token
          can’t resolve threads, approve, or release. The easiest way to get one is{" "}
          <code>review-feedback login</code>.
        </p>
        {error && <p className="admin-error">{error.message}</p>}

        <section className="review-dash-section">
          <h2>New token</h2>
          <form className="admin-add-form" onSubmit={(e) => void onCreate(e)}>
            <div className="admin-add-input">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name, e.g. laptop claude code"
                maxLength={100}
                aria-label="Token name"
              />
            </div>
            <Button type="submit" size="sm" disabled={!name.trim() || create.isPending}>
              Create
            </Button>
          </form>
          {secret && (
            <div className="tokens-secret">
              <code>{secret}</code>
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => void copyToClipboard(secret).then(setCopied)}
              >
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          )}
          {secret && (
            <p className="muted">
              Copy it now; it won’t be shown again. Save it with{" "}
              <code>review-feedback login --token -</code> or set <code>DOCS_REVIEW_TOKEN</code>.
            </p>
          )}
        </section>

        <section className="review-dash-section">
          <h2>Your tokens</h2>
          {tokens.length === 0 ? (
            <p className="muted">No tokens yet.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Token</th>
                  <th>Last used</th>
                  <th>Expires</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td>
                      <code>dfr_{t.prefix}…</code>
                    </td>
                    <td>{fmtDate(t.lastUsedAt)}</td>
                    <td>{fmtDate(t.expiresAt)}</td>
                    <td className="admin-row-actions">
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        disabled={revoke.isPending}
                        onClick={() => revoke.mutate({ id: t.id })}
                      >
                        Revoke
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </Shell>
  );
}
