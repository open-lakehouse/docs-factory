const ok = () => typeof navigator !== "undefined" && Boolean(navigator.clipboard);

/** Copy through a throwaway selection; works where the async API is refused. */
function legacyCopy(text: string): boolean {
  if (typeof document === "undefined") return false;
  const focused = document.activeElement as HTMLElement | null;
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
  document.body.append(area);
  area.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
    focused?.focus({ preventScroll: true });
  }
}

/** Write `text` to the clipboard. False when every method refuses. */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  if (ok()) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Refused (embedded webview, permissions policy): fall through.
    }
  }
  return legacyCopy(text);
}

/** Fetch `url` and write its body to the clipboard. */
export async function copyFromUrl(url: string): Promise<boolean> {
  const text = async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    return res.text();
  };
  if (ok()) {
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        // Safari only honours a write that starts inside the click, before any
        // await; a ClipboardItem accepts the fetch as a pending promise.
        const blob = text().then((t) => new Blob([t], { type: "text/plain" }));
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
      } else {
        await navigator.clipboard.writeText(await text());
      }
      return true;
    } catch {
      // Fall through to the selection copy below.
    }
  }
  try {
    // execCommand needs the click's transient activation, which outlives a quick fetch.
    return legacyCopy(await text());
  } catch {
    return false;
  }
}
