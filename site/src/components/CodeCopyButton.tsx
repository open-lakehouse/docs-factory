import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Copy button for a build-time-highlighted code block. */
export default function CodeCopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!code || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const Icon = copied ? Check : Copy;

  return (
    <button type="button" className="cb-copy" onClick={copy} aria-label="Copy code">
      <Icon aria-hidden="true" />
    </button>
  );
}
