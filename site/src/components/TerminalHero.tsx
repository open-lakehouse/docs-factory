import { Link } from "react-router-dom";

export default function TerminalHero() {
  return (
    <section className="terminal-hero" aria-label="Welcome">
      <div className="terminal-hero-head">
        <div className="cb-dots" aria-hidden="true">
          <span className="cb-dot cb-dot-red" />
          <span className="cb-dot cb-dot-yellow" />
          <span className="cb-dot cb-dot-green" />
        </div>
        <span className="cb-lang">zsh</span>
      </div>
      <div className="terminal-hero-body">
        <p className="terminal-hero-line">
          <span className="terminal-hero-prompt">$ </span>
          open-lakehouse --version
          <span className="terminal-hero-cursor" aria-hidden="true" />
        </p>
        <p className="terminal-hero-title">docs-factory preview</p>
        <p className="terminal-hero-line muted">
          Engine-neutral docs, blog drafts, and architecture diagrams — local
          preview over the content source.
        </p>
        <p className="terminal-hero-line">
          <span className="terminal-hero-prompt">$ </span>
          <Link to="/docs" className="terminal-hero-cmd">
            ls content/
          </Link>
        </p>
        <p className="terminal-hero-line">
          <span className="terminal-hero-prompt">$ </span>
          <Link to="/blog" className="terminal-hero-cmd">
            cat blogs/latest.md
          </Link>
        </p>
      </div>
    </section>
  );
}
