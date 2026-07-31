// Legacy /review/revops entry point. The blog pipeline + product rollup now live
// under Review → Overview in the workspace; keep this path as a redirect so old
// bookmarks and the classic dashboard's "Blog pipeline" link still land there.
import { Navigate } from "react-router-dom";
import {
  overviewTabsParam,
  overviewToken,
} from "../components/review/workspace/overview-token";

export default function RevOpsDashboard() {
  const search = new URLSearchParams({
    tabs: overviewTabsParam(),
    active: overviewToken("pipeline"),
  });
  return <Navigate to={`/review?${search.toString()}`} replace />;
}
