import { useCallback, type KeyboardEvent } from "react";

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
