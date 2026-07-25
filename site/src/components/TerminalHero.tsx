import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { explanationHref } from "../explain-bindings";
import {
  bootLineDelay,
  buildBootSequence,
  kindTag,
  splitBootSequence,
  type BootLine,
} from "../lib/terminal-boot-sequence";

function BootLineView({
  line,
  showCursor,
}: {
  line: BootLine;
  showCursor: boolean;
}) {
  switch (line.type) {
    case "command":
      return (
        <p className="terminal-hero-line terminal-hero-line--in">
          <span className="terminal-hero-prompt">$ </span>
          {line.text}
          {showCursor && <span className="terminal-hero-cursor" aria-hidden="true" />}
        </p>
      );
    case "status":
      return (
        <p
          className={
            line.muted
              ? "terminal-hero-line terminal-hero-line--in muted"
              : "terminal-hero-line terminal-hero-line--in"
          }
        >
          {line.text}
          {showCursor && <span className="terminal-hero-cursor" aria-hidden="true" />}
        </p>
      );
    case "load": {
      const href = explanationHref(line.entry.id);
      return (
        <p className="terminal-hero-line terminal-hero-line--in terminal-hero-load">
          <span className="terminal-hero-load-tag">{kindTag(line.entry.kind)}</span>
          {href ? (
            <Link to={href} className="terminal-hero-load-name">
              {line.entry.title}
            </Link>
          ) : (
            <span className="terminal-hero-load-name">{line.entry.title}</span>
          )}
          <span className="terminal-hero-load-ok">ok</span>
          {showCursor && <span className="terminal-hero-cursor" aria-hidden="true" />}
        </p>
      );
    }
    case "summary":
      return (
        <p className="terminal-hero-line terminal-hero-line--in terminal-hero-ok">
          estate ready — {line.capabilities} capabilities, {line.specifications}{" "}
          specifications, {line.implementations} implementations
          {showCursor && <span className="terminal-hero-cursor" aria-hidden="true" />}
        </p>
      );
    default:
      return null;
  }
}

function ExploreLinks({ showCursor }: { showCursor?: boolean }) {
  return (
    <p className="terminal-hero-line terminal-hero-explore">
      <Link to="/docs" className="terminal-hero-cmd">
        docs
      </Link>
      <Link to="/blog" className="terminal-hero-cmd">
        blog
      </Link>
      {showCursor && <span className="terminal-hero-cursor" aria-hidden="true" />}
    </p>
  );
}

export default function TerminalHero() {
  const { bootLines, summary } = useMemo(() => splitBootSequence(buildBootSequence()), []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"boot" | "end">("boot");
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      setPhase("end");
      return;
    }

    const timers: number[] = [];
    let i = 0;

    const step = () => {
      if (i >= bootLines.length) {
        timers.push(window.setTimeout(() => setPhase("end"), 450));
        return;
      }
      setVisibleCount(i + 1);
      const lineDelay = bootLineDelay(bootLines[i], i);
      i += 1;
      timers.push(window.setTimeout(step, lineDelay));
    };

    timers.push(window.setTimeout(step, 250));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [bootLines]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || phase !== "boot") return;
    el.scrollTop = el.scrollHeight;
  }, [visibleCount, phase]);

  const visibleBoot = bootLines.slice(0, visibleCount);
  const cursorOnBoot = phase === "boot" && visibleCount > 0;

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
      <div
        className={phase === "end" ? "terminal-hero-body terminal-hero-body--end" : "terminal-hero-body"}
        aria-live="polite"
      >
        {phase === "boot" ? (
          <div ref={scrollRef} className="terminal-hero-boot">
            {visibleBoot.map((line, i) => (
              <BootLineView
                key={i}
                line={line}
                showCursor={cursorOnBoot && i === visibleCount - 1}
              />
            ))}
          </div>
        ) : (
          <div className="terminal-hero-end">
            {summary && summary.type === "summary" && (
              <p className="terminal-hero-line terminal-hero-ok">
                estate ready — {summary.capabilities} capabilities,{" "}
                {summary.specifications} specifications, {summary.implementations}{" "}
                implementations
              </p>
            )}
            <p className="terminal-hero-line">
              <span className="terminal-hero-prompt">$ </span>
              open-lakehouse explore
            </p>
            <ExploreLinks />
          </div>
        )}
      </div>
    </section>
  );
}
