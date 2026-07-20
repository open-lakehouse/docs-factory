/**
 * Write text to the clipboard, resolving to whether it succeeded. Guards against
 * SSR / unavailable clipboard and swallows the rejection so callers can branch
 * on the boolean instead of wrapping their own try/catch.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text || typeof navigator === "undefined" || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
