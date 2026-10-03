import { Check, Copy } from "lucide-react";
import { useState } from "react";

async function copyToClipboard(text: string): Promise<boolean> {
  if (!text || typeof navigator === "undefined" || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

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
