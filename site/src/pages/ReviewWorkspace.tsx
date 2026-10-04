// The consolidated review page (/review): reviewers, plus invited contributors
// narrowed to what was shared with them. On desktop it renders the editor-style
// 3-pane workspace; on narrow screens it falls back to the classic dashboard (a
// three-pane editor doesn't fit a phone) until a page is opened. The dashboard
// also stays reachable at /review/dashboard.
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Shell from "../components/layout/Shell";
import WorkspaceShell from "../components/review/workspace/WorkspaceShell";
import { useAuth } from "../lib/auth-context";
import ReviewDashboard from "./ReviewDashboard";

/** True on narrow screens (matches the DocAside `max-[960px]` breakpoint). */
function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 960px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 960px)");
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

export default function ReviewWorkspace() {
  const { isLoading: authLoading, isAllowlisted, hasScopedGrants } = useAuth();
  const isNarrow = useIsNarrow();
  const [params] = useSearchParams();
  const opensContent = /(^|,)(docs|blogs):/.test(params.get("tabs") ?? "");

  // Narrow screens: reuse the classic dashboard wholesale (it owns its own Shell
  // and auth guard) until a page is opened — the workspace is the only page
  // renderer. The dashboard is reviewer-only, so invitees keep the workspace.
  if (isNarrow && isAllowlisted && !opensContent) return <ReviewDashboard />;

  // Route guard. Wait for the viewer to resolve before deciding
  // (mirrors ReviewDashboard) so we don't flash "not found" at a reviewer.
  if (authLoading) {
    return (
      <Shell>
        <p className="muted">Loading…</p>
      </Shell>
    );
  }
  if (!isAllowlisted && !hasScopedGrants) {
    return (
      <Shell>
        <p>
          Not found. <Link to="/">Back home.</Link>
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="review-workspace-layout">
        <WorkspaceShell />
      </div>
    </Shell>
  );
}
