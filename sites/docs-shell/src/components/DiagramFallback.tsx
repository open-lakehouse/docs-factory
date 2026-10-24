// What a diagram's prerendered page carries before the interactive canvas
// loads, and all that crawlers and no-JS readers get: the alt text, and the
// diagram's Mermaid when the emitter supplied it. The Mermaid starts collapsed,
// so a reader with JS doesn't see a flash of source before the canvas.
export function DiagramFallback({ alt, mermaid }: { alt: string; mermaid?: string }) {
  return (
    <div className="diagram-fallback">
      <p>{alt}</p>
      {mermaid && (
        <details>
          <summary>Diagram as Mermaid</summary>
          <pre>
            <code className="language-mermaid">{mermaid}</code>
          </pre>
        </details>
      )}
    </div>
  );
}
