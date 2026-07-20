import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyToClipboard } from "../lib/clipboard";

/** Copy button for a build-time-highlighted code block. */
export default function CodeCopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (await copyToClipboard(code)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const Icon = copied ? Check : Copy;

  return (
    <button
      type="button"
      className="cb-copy"
      data-copied={copied ? "true" : undefined}
      onClick={copy}
      aria-label="Copy code"
    >
      <Icon aria-hidden="true" />
    </button>
  );
}
