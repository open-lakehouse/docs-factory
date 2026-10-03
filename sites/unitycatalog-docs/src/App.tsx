import { Route, Routes } from "react-router-dom";
import DocPage from "./pages/DocPage";
import HomePage from "./pages/HomePage";
import NotFound from "./pages/NotFound";
import { site } from "./site";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      {site.pages.map((page) => (
        <Route key={page.route} path={page.route} element={<DocPage page={page} />} />
      ))}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
