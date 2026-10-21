import { Navigate, Route, Routes } from "react-router-dom";
import AdminDashboard from "./pages/AdminDashboard";
import AgentTokens from "./pages/AgentTokens";
import CliAuth from "./pages/CliAuth";
import ConceptsPage from "./pages/model/ConceptsPage";
import CoveragePage from "./pages/model/CoveragePage";
import ModelExplorer from "./pages/model/ModelExplorer";
import ModelLayout from "./pages/model/ModelLayout";
import OpenInWorkspace from "./pages/OpenInWorkspace";
import PlanLayout from "./pages/plan/PlanLayout";
import PlanSummary from "./pages/plan/PlanSummary";
import Requests from "./pages/plan/Requests";
import Roadmap from "./pages/plan/Roadmap";
import { ChangesPage, CompatPage, PipelinePage } from "./pages/plan/SectionPages";
import ReviewDashboard from "./pages/ReviewDashboard";
import ReviewWorkspace from "./pages/ReviewWorkspace";

export default function App() {
  return (
    <Routes>
      {/* The editor-style workspace on desktop, the classic dashboard on narrow
            screens; the dashboard also stays reachable directly. Both guard
            access inside the page. */}
      <Route path="/review" element={<ReviewWorkspace />} />
      <Route path="/review/dashboard" element={<ReviewDashboard />} />

      {/* Planning: roadmap, compatibility, blog pipeline, backlog. Reviewer-only;
            PlanLayout guards every section. */}
      <Route path="/plan" element={<PlanLayout />}>
        <Route index element={<PlanSummary />} />
        <Route path="roadmap" element={<Roadmap />} />
        <Route path="compat" element={<CompatPage />} />
        <Route path="pipeline" element={<PipelinePage />} />
        <Route path="requests" element={<Requests />} />
        <Route path="coverage" element={<Navigate replace to="/model/coverage" />} />
        <Route path="changes" element={<ChangesPage />} />
        <Route path="*" element={<Navigate replace to="/plan" />} />
      </Route>

      {/* The estate model: LikeC4 explorer with what the docs derive from each
            element, the published concepts, the explanation backlog, and review
            threads on elements and views. Reviewer-only; ModelLayout guards it. */}
      <Route path="/model" element={<ModelLayout />}>
        <Route index element={<ModelExplorer />} />
        <Route path="concepts" element={<ConceptsPage />} />
        <Route path="coverage" element={<CoveragePage />} />
        <Route path="*" element={<Navigate replace to="/model" />} />
      </Route>

      {/* Maintainer-only admin roster: allowlist management + registered-user
            discovery + erasure. Guards maintainer-only access inside the page. */}
      <Route path="/admin" element={<AdminDashboard />} />

      {/* Personal access tokens for agents, and the CLI login consent step. */}
      <Route path="/tokens" element={<AgentTokens />} />
      <Route path="/cli-auth" element={<CliAuth />} />

      <Route path="/blog/:slug" element={<OpenInWorkspace />} />
      <Route path="/docs/:project/:bucket/:slug" element={<OpenInWorkspace />} />

      <Route path="*" element={<Navigate replace to="/review" />} />
    </Routes>
  );
}
