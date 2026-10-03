const ok = () => typeof navigator !== "undefined" && Boolean(navigator.clipboard);

/** Write `text` to the clipboard. False when the API is missing or refuses. */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text || !ok()) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Fetch `url` and write its body to the clipboard. */
export async function copyFromUrl(url: string): Promise<boolean> {
  if (!ok()) return false;
  const text = async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    return res.text();
  };
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
    return false;
  }
}
