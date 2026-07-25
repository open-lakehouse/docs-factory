// The reviewer-only consolidated review page (/review). On desktop it renders
// the editor-style 3-pane workspace; on narrow screens it falls back to the
// classic dashboard (a three-pane editor doesn't fit a phone). The old
// dashboard also stays reachable at /review/dashboard.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import Shell from "../components/layout/Shell";
import WorkspaceShell from "../components/review/workspace/WorkspaceShell";
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
  const { isLoading: authLoading, isAllowlisted } = useAuth();
  const isNarrow = useIsNarrow();

  // Narrow screens: reuse the classic dashboard wholesale (it owns its own Shell
  // and auth guard).
  if (isNarrow) return <ReviewDashboard />;

  // Route guard: reviewer-only. Wait for the viewer to resolve before deciding
  // (mirrors ReviewDashboard) so we don't flash "not found" at a reviewer.
  if (authLoading) {
    return (
      <Shell wide>
        <p className="muted">Loading…</p>
      </Shell>
    );
  }
  if (!isAllowlisted) {
    return (
      <Shell wide>
        <p>
          Not found. <Link to="/">Back home.</Link>
        </p>
      </Shell>
    );
  }

  return (
    <Shell wide>
      <div className="review-workspace-layout">
        <WorkspaceShell />
      </div>
    </Shell>
  );
}
