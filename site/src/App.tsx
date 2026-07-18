import { Route, Routes } from "react-router-dom";
import Index from "./pages/Index";
import DocsIndex from "./pages/DocsIndex";
import DocPage from "./pages/DocPage";
import BlogIndex from "./pages/BlogIndex";
import BlogPost from "./pages/BlogPost";
import { ExplainIndex, ExplainPage } from "./ExplainPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/blog" element={<BlogIndex />} />
      <Route path="/blog/:slug" element={<BlogPost />} />
      <Route path="/docs" element={<DocsIndex />} />
      <Route path="/docs/:project/:bucket/:slug" element={<DocPage />} />
      <Route path="/explain" element={<ExplainIndex />} />
      <Route path="/explain/:elementId" element={<ExplainPage />} />
    </Routes>
  );
}
