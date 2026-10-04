import { Navigate, Route, Routes } from "react-router-dom";
import AdminDashboard from "./pages/AdminDashboard";
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

      <Route path="/blog/:slug" element={<OpenInWorkspace />} />
      <Route path="/docs/:project/:bucket/:slug" element={<OpenInWorkspace />} />

      <Route path="*" element={<Navigate replace to="/review" />} />
    </Routes>
  );
}
