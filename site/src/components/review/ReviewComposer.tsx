import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

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

function InlineReviewComposer({
  value,
  onChange,
  onSubmit,
  placeholder,
  submitLabel,
  disabled,
  submitting,
  autoFocus,
}: Pick<
  ReviewComposerProps,
  "value" | "onChange" | "onSubmit" | "placeholder" | "submitLabel" | "disabled" | "submitting" | "autoFocus"
>) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const singleLineHeightRef = useRef<number | null>(null);
  const [multiline, setMultiline] = useState(false);

  const syncSendAlignment = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const height = el.getBoundingClientRect().height;
    if (singleLineHeightRef.current == null) {
      singleLineHeightRef.current = height;
    }
    setMultiline(height > singleLineHeightRef.current + 2);
  }, []);

  useEffect(() => {
    syncSendAlignment();
  }, [value, syncSendAlignment]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => syncSendAlignment());
    observer.observe(el);
    return () => observer.disconnect();
  }, [syncSendAlignment]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (!disabled && !submitting && value.trim()) onSubmit();
      }
    },
    [disabled, onSubmit, submitting, value],
  );

  const canSend = !disabled && !submitting && Boolean(value.trim());

  return (
    <div className="relative flex">
      <Textarea
        ref={textareaRef}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={1}
        disabled={disabled || submitting}
        aria-label={placeholder}
        className="max-h-44 min-h-9 resize-none pr-11"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onSubmit}
        disabled={!canSend}
        aria-label={submitLabel}
        title={`${submitLabel} (⌘/Ctrl+Enter)`}
        className={cn(
          "absolute right-1.5 text-muted-foreground hover:text-foreground",
          multiline ? "bottom-1.5" : "top-1/2 -translate-y-1/2",
        )}
      >
        <Send />
      </Button>
    </div>
  );
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
        return;
      }
      if (e.key === "Escape" && onCancel) {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    },
    [disabled, onCancel, onSubmit, submitting, value],
  );

  if (inline) {
    return (
      <InlineReviewComposer
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        placeholder={placeholder}
        submitLabel={submitLabel}
        disabled={disabled}
        submitting={submitting}
        autoFocus={autoFocus}
      />
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", compact && "gap-1.5")}>
      <Textarea
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled || submitting}
        aria-label={placeholder}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={onSubmit}
          disabled={disabled || submitting || !value.trim()}
        >
          {submitting ? "Posting…" : submitLabel}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onCancel}
            title="Cancel (Esc)"
          >
            Cancel
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          ⌘/Ctrl+Enter to post
          {onCancel ? " · Esc to cancel" : ""}
        </span>
      </div>
    </div>
  );
}
