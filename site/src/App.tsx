import { Route, Routes } from "react-router-dom";
import Index from "./pages/Index";
import DocsIndex from "./pages/DocsIndex";
import DocPage from "./pages/DocPage";
import BlogIndex from "./pages/BlogIndex";
import BlogPost from "./pages/BlogPost";
import ReviewDashboard from "./pages/ReviewDashboard";
import ReviewWorkspace from "./pages/ReviewWorkspace";
import RevOpsDashboard from "./pages/RevOpsDashboard";
import AdminDashboard from "./pages/AdminDashboard";

export default function App() {
  return (
    <>
      {/* DevPersonaSwitcher is mounted in AccessGate so it stays reachable from
          the pre-admission (sign-in / pending) screens too — see AccessGate. */}
      <Routes>
        <Route path="/" element={<Index />} />

        {/* Two content areas: a single Docs page stacking all four Diátaxis
            axis tables under one concept filter, plus the blog. */}
        <Route path="/docs" element={<DocsIndex />} />
        <Route path="/blog" element={<BlogIndex />} />

        {/* Reviewer-only consolidated review page: the editor-style workspace
            on desktop, the classic dashboard on narrow screens. The dashboard
            also stays reachable directly. Both guard reviewer-only access
            inside the page. */}
        <Route path="/review" element={<ReviewWorkspace />} />
        <Route path="/review/dashboard" element={<ReviewDashboard />} />
        {/* Reviewer-only blog pipeline: priority order + target release dates. */}
        <Route path="/review/revops" element={<RevOpsDashboard />} />

        {/* Maintainer-only admin roster: allowlist management + registered-user
            discovery + erasure. Guards maintainer-only access inside the page. */}
        <Route path="/admin" element={<AdminDashboard />} />

        {/* Detail routes. Explanation concepts are ordinary doc pages that
            declare `explains: <id>`; there is no separate /explain route — the
            model context folds into the doc page (see components/ModelContext). */}
        <Route path="/blog/:slug" element={<BlogPost />} />
        <Route path="/docs/:project/:bucket/:slug" element={<DocPage />} />
      </Routes>
    </>
  );
}
