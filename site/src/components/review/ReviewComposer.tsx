import { useCallback, useLayoutEffect, useRef, type KeyboardEvent } from "react";

interface ReviewComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  placeholder?: string;
  rows?: number;
  submitLabel?: string;
  disabled?: boolean;
  submitting?: boolean;
  autoFocus?: boolean;
  compact?: boolean;
  /** Always-on single field with an embedded send button (no reveal step). */
  inline?: boolean;
}

export default function ReviewComposer({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder = "Write a comment…",
  rows = 3,
  submitLabel = "Comment",
  disabled = false,
  submitting = false,
  autoFocus = false,
  compact = false,
  inline = false,
}: ReviewComposerProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (!disabled && !submitting && value.trim()) onSubmit();
      }
    },
    [disabled, onSubmit, submitting, value],
  );

  // Auto-grow the inline field: start at one row and expand as lines wrap/break,
  // so the box height tracks the content instead of a fixed two-row min-height.
  const inlineRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (!inline) return;
    const el = inlineRef.current;
    if (!el) return;
    // scrollHeight covers content + padding; add the (border-box) borders so the
    // measured height matches exactly and doesn't leave a 1–2px phantom scroll.
    const cs = window.getComputedStyle(el);
    const border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + border}px`;
  }, [inline, value]);

  if (inline) {
    const canSend = !disabled && !submitting && Boolean(value.trim());
    return (
      <div className="review-composer inline">
        <textarea
          ref={inlineRef}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={disabled || submitting}
          aria-label={placeholder}
        />
        <button
          type="button"
          className="review-send"
          onClick={onSubmit}
          disabled={!canSend}
          aria-label={submitLabel}
          title={`${submitLabel} (⌘/Ctrl+Enter)`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 12l16-8-6 16-3.2-6.4L4 12z"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className={`review-composer${compact ? " compact" : ""}`}>
      <textarea
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled || submitting}
        aria-label={placeholder}
      />
      <div className="review-composer-actions">
        <button
          type="button"
          className="review-btn primary"
          onClick={onSubmit}
          disabled={disabled || submitting || !value.trim()}
        >
          {submitting ? "Posting…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="review-btn secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
        <span className="review-composer-hint">⌘/Ctrl+Enter to post</span>
      </div>
    </div>
  );
}
