import { Route, Routes } from "react-router-dom";
import Index from "./pages/Index";
import AxisIndex from "./pages/AxisIndex";
import DocPage from "./pages/DocPage";
import BlogIndex from "./pages/BlogIndex";
import BlogPost from "./pages/BlogPost";
import { ExplainPage } from "./ExplainPage";
import DevPersonaSwitcher from "./components/DevPersonaSwitcher";

export default function App() {
  return (
    <>
      <DevPersonaSwitcher />
      <Routes>
        <Route path="/" element={<Index />} />

        {/* Five content axes: four Diátaxis + blog. */}
        <Route path="/tutorials" element={<AxisIndex axis="tutorial" />} />
        <Route path="/how-to" element={<AxisIndex axis="how-to" />} />
        <Route path="/reference" element={<AxisIndex axis="reference" />} />
        <Route path="/explanation" element={<AxisIndex axis="explanation" />} />
        <Route path="/blog" element={<BlogIndex />} />

        {/* Detail routes (content locations unchanged). */}
        <Route path="/blog/:slug" element={<BlogPost />} />
        <Route path="/docs/:project/:bucket/:slug" element={<DocPage />} />
        <Route path="/explain/:elementId" element={<ExplainPage />} />
      </Routes>
    </>
  );
}
