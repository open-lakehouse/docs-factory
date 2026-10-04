import { Route, Routes } from "react-router-dom";
import ApiPage from "./pages/ApiPage";
import DocPage from "./pages/DocPage";
import HomePage from "./pages/HomePage";
import NotFound from "./pages/NotFound";
import { defaultApi, site } from "./site";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      {site.pages.map((page) => (
        <Route key={page.route} path={page.route} element={<DocPage page={page} />} />
      ))}
      {site.apis.map((api) => (
        <Route key={api.route} path={api.route} element={<ApiPage api={api} />} />
      ))}
      {site.apiIndex && defaultApi && (
        <Route path={site.apiIndex} element={<ApiPage api={defaultApi} />} />
      )}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
