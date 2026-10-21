// Persisted "show resolved threads" preference for the comment rail and the
// All comments feed. Off by default: resolved threads are history, not work.
import { useEffect, useState } from "react";

const STORAGE_KEY = "review.showResolved";
const EVENT = "review-show-resolved";

function read(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "1";
}

function write(show: boolean): void {
  if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, show ? "1" : "0");
  window.dispatchEvent(new CustomEvent(EVENT, { detail: show }));
}

/** The current preference, kept in sync across every mounted rail via the event. */
export function useShowResolved(): [boolean, (show: boolean) => void] {
  const [show, setShow] = useState<boolean>(read);
  useEffect(() => {
    const onChange = (e: Event) => setShow(Boolean((e as CustomEvent<boolean>).detail));
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  return [show, write];
}
