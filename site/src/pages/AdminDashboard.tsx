// The site-admin roster (/admin). Site-admin-only (Neon Auth's admin role, set
// via the Neon Console — the persistent, DB-drop-surviving anchor for admins).
// Replaces the old direct-SQL-only workflow for managing who can review/maintain
// the site:
//   1. Allowlist — the current reviewer_allowlist with audit metadata; add,
//      remove, or change a role in place.
//   2. Registered users — everyone who has logged in via GitHub OAuth (from the
//      auth provider), with their resolved role. People who logged in but never
//      got a status show as "no status" and can be granted access in one click.
//   3. Erase user — the right-to-erasure flow (tombstone footprint), behind a
//      destructive-action confirmation.
//
// Gated on isSiteAdmin inside the page (mirrors ReviewDashboard's guard) so the
// route stays SSR-renderable and hydration resolves access. A plain maintainer
// does NOT reach this page. All writes go through the site-admin-only
// ManageAllowlist / EraseUser RPCs; the server owns the last-maintainer
// invariant, this UI only warns before firing it.
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@connectrpc/connect-query";
import { timestampDate } from "@bufbuild/protobuf/wkt";
import {
  listAllowlist,
  listRegisteredUsers,
  manageAllowlist,
  eraseUser,
} from "../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { ManageAllowlistRequest_Action } from "../gen/docs_factory/review/v1/review_service_pb";
import {
  Role,
  type AllowlistEntryDetail,
  type RegisteredUser,
  type UserSummary,
} from "../gen/docs_factory/review/v1/messages_pb";
import { useAuth } from "../lib/auth-context";
import { useReviewInvalidation } from "../lib/review-queries";
import Shell from "../components/layout/Shell";
import UserPicker from "../components/review/UserPicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function roleLabel(role: Role): string {
  if (role === Role.MAINTAINER) return "Maintainer";
  if (role === Role.REVIEWER) return "Reviewer";
  return "No status";
}

// Role → shadcn Badge variant, so role chips share the design-token badge the
// rest of the site uses (StatusBadge / review-status) rather than a bespoke
// `admin-role` class set. Maintainer is the emphasized role, reviewer is
// secondary, "no status" is a muted outline.
const ROLE_VARIANT: Partial<Record<Role, "default" | "secondary" | "outline">> = {
  [Role.MAINTAINER]: "default",
  [Role.REVIEWER]: "secondary",
  [Role.ANONYMOUS]: "outline",
};

function RoleBadge({ role }: { role: Role }) {
  return <Badge variant={ROLE_VARIANT[role] ?? "outline"}>{roleLabel(role)}</Badge>;
}

function fmtDate(ts: { seconds: bigint } | undefined): string {
  if (!ts) return "";
  return timestampDate(ts as never).toLocaleDateString();
}

/** Identity of an allowlist row a maintainer wants to add/edit/remove. */
type AllowlistOp = { userId: string; role: Role };

export default function AdminDashboard() {
  const { isLoading: authLoading, isSiteAdmin, viewer } = useAuth();
  const { invalidateAllowlist, invalidateRegisteredUsers } = useReviewInvalidation();

  const { data: allowlistData, isLoading: allowlistLoading } = useQuery(
    listAllowlist,
    {},
    { enabled: isSiteAdmin },
  );
  const { data: registeredData, isLoading: registeredLoading } = useQuery(
    listRegisteredUsers,
    {},
    { enabled: isSiteAdmin },
  );

  const refreshRoster = () => {
    void invalidateAllowlist();
    void invalidateRegisteredUsers();
  };

  // ManageAllowlist add doubles as edit-role (upsert by identifier), so a single
  // mutation covers add, grant-from-registered, and role change.
  const manage = useMutation(manageAllowlist, { onSuccess: refreshRoster });
  const erase = useMutation(eraseUser, { onSuccess: refreshRoster });

  // Add-form state: a single picked registered user + the role to grant.
  const [addUser, setAddUser] = useState<UserSummary[]>([]);
  const [addRole, setAddRole] = useState<Role>(Role.REVIEWER);

  // Confirm dialogs (self/last-maintainer removal, and erasure).
  const [confirmRemove, setConfirmRemove] = useState<AllowlistEntryDetail | null>(null);
  const [confirmErase, setConfirmErase] = useState<RegisteredUser | null>(null);

  // Route guard: site-admin-only (Neon Auth admin role). Wait for the viewer to
  // resolve first so we don't flash "not found" at an admin mid-hydration
  // (mirrors DocPage). A plain maintainer falls through to "not found" here.
  if (authLoading) {
    return (
      <Shell wide>
        <p className="muted">Loading…</p>
      </Shell>
    );
  }
  if (!isSiteAdmin) {
    return (
      <Shell wide>
        <p>
          Not found. <Link to="/">Back home.</Link>
        </p>
      </Shell>
    );
  }

  const entries = allowlistData?.entries ?? [];
  const registered = registeredData?.users ?? [];
  const maintainerCount = entries.filter((e) => e.role === Role.MAINTAINER).length;
  const myUserId = viewer?.userId ?? "";

  const isSelf = (e: AllowlistEntryDetail) => !!e.userId && e.userId === myUserId;
  // A remove that would be blocked by the server (last maintainer), or that
  // demotes the viewer's own access — warn before firing.
  const needsConfirm = (e: AllowlistEntryDetail) =>
    (e.role === Role.MAINTAINER && maintainerCount <= 1) || isSelf(e);

  const doAdd = async (op: AllowlistOp) => {
    await manage.mutateAsync({
      action: ManageAllowlistRequest_Action.ADD,
      entry: { userId: op.userId, role: op.role },
    });
  };

  const submitAdd = async () => {
    const user = addUser[0];
    if (!user) return;
    await doAdd({ userId: user.userId, role: addRole });
    setAddUser([]);
    setAddRole(Role.REVIEWER);
  };

  const changeRole = async (e: AllowlistEntryDetail, role: Role) => {
    // Demoting the last maintainer would be rejected server-side; warn first.
    if (e.role === Role.MAINTAINER && role !== Role.MAINTAINER && maintainerCount <= 1) {
      window.alert("Can't demote the last maintainer. Add another maintainer first.");
      return;
    }
    await doAdd({ userId: e.userId, role });
  };

  const doRemove = async (e: AllowlistEntryDetail) => {
    await manage.mutateAsync({
      action: ManageAllowlistRequest_Action.REMOVE,
      entry: { userId: e.userId, role: e.role },
    });
    setConfirmRemove(null);
  };

  const requestRemove = (e: AllowlistEntryDetail) => {
    if (needsConfirm(e)) setConfirmRemove(e);
    else void doRemove(e);
  };

  return (
    <Shell wide>
      <div className="admin-page">
        <h1>Admin</h1>
        <p className="review-dash-hint">
          Manage who can review and maintain the site. Only people who have signed
          in can be granted a role — search for them below or grant a registered
          user directly.
        </p>

        {manage.error && <p className="admin-error">{manage.error.message}</p>}

        {/* 1. Allowlist -------------------------------------------------- */}
        <section className="review-dash-section">
          <h2>Allowlist</h2>
          <form
            className="admin-add-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submitAdd();
            }}
          >
            <div className="admin-add-input">
              <UserPicker
                value={addUser}
                onChange={setAddUser}
                multiple={false}
                placeholder="Search registered people…"
              />
            </div>
            <div className="admin-role-toggle" role="group" aria-label="Role">
              <Button
                type="button"
                variant={addRole === Role.REVIEWER ? "default" : "outline"}
                size="sm"
                onClick={() => setAddRole(Role.REVIEWER)}
              >
                Reviewer
              </Button>
              <Button
                type="button"
                variant={addRole === Role.MAINTAINER ? "default" : "outline"}
                size="sm"
                onClick={() => setAddRole(Role.MAINTAINER)}
              >
                Maintainer
              </Button>
            </div>
            <Button type="submit" size="sm" disabled={manage.isPending || addUser.length === 0}>
              Add
            </Button>
          </form>

          {allowlistLoading ? (
            <p className="muted">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="muted">No one is on the allowlist yet.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>GitHub login</th>
                  <th>Email</th>
                  <th>Added by</th>
                  <th>Added</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.userId}>
                    <td>
                      <RoleBadge role={e.role} />
                    </td>
                    <td>{e.githubLogin || <span className="muted">—</span>}</td>
                    <td>{e.email || <span className="muted">—</span>}</td>
                    <td>{e.addedBy || <span className="muted">—</span>}</td>
                    <td>{fmtDate(e.createdAt)}</td>
                    <td className="admin-row-actions">
                      {e.role === Role.MAINTAINER ? (
                        <Button
                          variant="outline"
                          size="xs"
                          disabled={manage.isPending}
                          onClick={() => void changeRole(e, Role.REVIEWER)}
                        >
                          Make reviewer
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="xs"
                          disabled={manage.isPending}
                          onClick={() => void changeRole(e, Role.MAINTAINER)}
                        >
                          Make maintainer
                        </Button>
                      )}
                      <Button
                        variant="destructive"
                        size="xs"
                        disabled={manage.isPending}
                        onClick={() => requestRemove(e)}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* 2. Registered users ------------------------------------------ */}
        <section className="review-dash-section">
          <h2>Registered users</h2>
          <p className="review-dash-hint">
            Everyone registered in Neon Auth. People with “no status” can only see
            published content — grant them a role to let them review. Users who
            haven’t signed into the app yet show no GitHub login or last-seen date
            until their first visit.
          </p>
          {registeredLoading ? (
            <p className="muted">Loading…</p>
          ) : registered.length === 0 ? (
            <p className="muted">
              No registered users to show. (Discovery reads Neon Auth’s tables,
              which exist only against the real Neon Auth database.)
            </p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>GitHub login</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Last seen</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {registered.map((u) => (
                  <tr key={u.userId}>
                    <td>{u.githubLogin || <span className="muted">—</span>}</td>
                    <td>{u.email || <span className="muted">—</span>}</td>
                    <td>
                      <RoleBadge role={u.role} />
                    </td>
                    <td>{fmtDate(u.lastSeenAt)}</td>
                    <td className="admin-row-actions">
                      {u.role === Role.ANONYMOUS && (
                        <>
                          <Button
                            variant="outline"
                            size="xs"
                            disabled={manage.isPending}
                            onClick={() => void doAdd({ userId: u.userId, role: Role.REVIEWER })}
                          >
                            Grant reviewer
                          </Button>
                          <Button
                            variant="outline"
                            size="xs"
                            disabled={manage.isPending}
                            onClick={() => void doAdd({ userId: u.userId, role: Role.MAINTAINER })}
                          >
                            Grant maintainer
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={erase.isPending}
                        onClick={() => setConfirmErase(u)}
                      >
                        Erase
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {/* Confirm removal (self / last maintainer) ----------------------- */}
      <Dialog open={!!confirmRemove} onOpenChange={(o) => !o && setConfirmRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove from allowlist?</DialogTitle>
            <DialogDescription>
              {confirmRemove && isSelf(confirmRemove)
                ? "This is your own access — you'll lose it immediately."
                : "This removes their reviewer/maintainer access."}
              {confirmRemove &&
                confirmRemove.role === Role.MAINTAINER &&
                maintainerCount <= 1 &&
                " This is the last maintainer; the server will block it."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmRemove(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={manage.isPending}
              onClick={() => confirmRemove && void doRemove(confirmRemove)}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm erasure ------------------------------------------------- */}
      <Dialog
        open={!!confirmErase}
        onOpenChange={(o) => {
          if (!o) {
            setConfirmErase(null);
            // Clear the previous result/error so reopening for another user
            // never shows the last erasure's counts (they'd be misattributed).
            erase.reset();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Erase this user’s footprint?</DialogTitle>
            <DialogDescription>
              Tombstones their comments (keeping thread structure), scrubs their
              identity from review-state, resolutions, and approvals, cancels any
              open review requests addressed to them, and deletes their
              read-state. Content-version provenance is untouched. This does not
              remove their allowlist access — do that separately. Cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          {erase.error && <p className="admin-error">{erase.error.message}</p>}
          {erase.data && (
            <p className="muted">
              Tombstoned {erase.data.commentsTombstoned} comment(s), scrubbed{" "}
              {erase.data.reviewStatesScrubbed} review-state and{" "}
              {erase.data.resolutionsScrubbed} resolution actor(s), cancelled{" "}
              {erase.data.requestsCancelled} open review request(s), deleted{" "}
              {erase.data.seenRowsDeleted} read-state row(s).
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmErase(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={erase.isPending}
              onClick={() =>
                confirmErase &&
                void erase.mutateAsync({
                  userId: confirmErase.userId,
                  login: confirmErase.githubLogin,
                })
              }
            >
              Erase
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
