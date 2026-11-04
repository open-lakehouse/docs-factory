// <trestle-view src="…/diagram.trestle-graph.json" label="…" color-mode="dark">
//
// A Trestle environment diagram as a custom element, so a site without React 19
// can draw it: this bundle carries its own React. It renders into the light DOM;
// the package's styles are scoped under `.trestle-diagram`, and a shadow root
// would strand the popovers it portals into document.body unstyled.
//
// Children the host puts inside the element (its fallback text) stay until the
// snapshot has loaded, and stay if it never does.
import { EnvironmentDiagram } from "@open-lakehouse/trestle-diagram";
import styles from "@open-lakehouse/trestle-diagram/styles.css" with { type: "text" };
import { createRoot, type Root } from "react-dom/client";

const STYLE_ID = "trestle-diagram-styles";

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = styles;
  document.head.append(style);
}

type ColorMode = "light" | "dark" | "system";

const colorMode = (value: string | null): ColorMode =>
  value === "light" || value === "dark" ? value : "system";

class TrestleView extends HTMLElement {
  static observedAttributes = ["src", "label", "color-mode"];

  #root: Root | null = null;
  #mount: HTMLDivElement | null = null;
  #snapshot: unknown = null;
  #loaded: string | null = null;

  connectedCallback() {
    injectStyles();
    this.#load();
  }

  disconnectedCallback() {
    this.#root?.unmount();
    this.#root = null;
    this.#mount?.remove();
    this.#mount = null;
    this.#loaded = null;
  }

  attributeChangedCallback(name: string) {
    if (!this.isConnected) return;
    if (name === "src") this.#load();
    else this.#render();
  }

  #load() {
    const src = this.getAttribute("src");
    if (!src || src === this.#loaded) return;
    this.#loaded = src;
    fetch(src)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${src}: HTTP ${r.status}`))))
      .then((snapshot) => {
        if (this.#loaded !== src) return;
        this.#snapshot = snapshot;
        this.#render();
      })
      .catch((err) => console.warn(`trestle-view: ${err.message}`));
  }

  #render() {
    if (!this.#snapshot) return;
    if (!this.#mount) {
      // The fallback goes once the diagram can replace it.
      this.replaceChildren();
      this.#mount = document.createElement("div");
      this.append(this.#mount);
      this.#root = createRoot(this.#mount);
    }
    // A snapshot's file paths are relative to the snapshot.
    const base = new URL(this.getAttribute("src") ?? "", document.baseURI);
    const readFile = (path: string) =>
      fetch(new URL(path, base)).then((r) =>
        r.ok ? r.text() : Promise.reject(new Error(`${path}: HTTP ${r.status}`)),
      );
    this.#root?.render(
      <EnvironmentDiagram
        snapshot={this.#snapshot}
        label={this.getAttribute("label") ?? undefined}
        colorMode={colorMode(this.getAttribute("color-mode"))}
        readFile={readFile}
      />,
    );
  }
}

if (!customElements.get("trestle-view")) customElements.define("trestle-view", TrestleView);
