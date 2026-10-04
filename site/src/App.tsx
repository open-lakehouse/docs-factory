import { Navigate, Route, Routes } from "react-router-dom";
import AdminDashboard from "./pages/AdminDashboard";
import AgentTokens from "./pages/AgentTokens";
import CliAuth from "./pages/CliAuth";
import OpenInWorkspace from "./pages/OpenInWorkspace";
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
