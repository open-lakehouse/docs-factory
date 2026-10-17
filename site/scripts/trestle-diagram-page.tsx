// The page render-trestle-diagrams.mjs screenshots: one read-only diagram,
// light, without the expand button, at the width the PNG is drawn at.
import { EnvironmentDiagram } from "@open-lakehouse/trestle-diagram";
import { createRoot } from "react-dom/client";

declare global {
  interface Window {
    renderDiagram: (snapshot: unknown) => void;
  }
}

window.renderDiagram = (snapshot) => {
  const host = document.getElementById("root");
  if (!host) throw new Error("no #root");
  createRoot(host).render(
    <EnvironmentDiagram
      snapshot={snapshot}
      colorMode="light"
      expandable={false}
      maxHeight={4000}
    />,
  );
};
