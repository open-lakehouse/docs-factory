// A `:::tab` group. Groups sync by label (choosing "CLI" switches every group
// with a "CLI" tab) and the choice persists across pages.
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useId,
  useSyncExternalStore,
} from "react";

const STORAGE_KEY = "unitycatalog-docs:content-tab";
const listeners = new Set<() => void>();

function readPreferred(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function setPreferred(label: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, label);
  } catch {
    // Storage can be unavailable (private mode); the in-page sync still works.
  }
  for (const notify of listeners) notify();
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  const onStorage = (e: StorageEvent) => e.key === STORAGE_KEY && notify();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", onStorage);
  };
}

interface ContentTabProps {
  label: string;
  children: ReactNode;
}

/** Marker element; <ContentTabs> reads its props and renders the panel. */
export function ContentTab({ children }: ContentTabProps) {
  return <>{children}</>;
}

export function ContentTabs({ children }: { children: ReactNode }) {
  const tabs = Children.toArray(children).filter(isValidElement) as ReactElement<ContentTabProps>[];
  const labels = tabs.map((t) => t.props.label);
  // The server snapshot is null, so prerendered HTML and hydration both start on
  // the first tab; the stored preference applies right after.
  const preferred = useSyncExternalStore(subscribe, readPreferred, () => null);
  const active = preferred && labels.includes(preferred) ? preferred : labels[0];
  const id = useId();

  return (
    <div className="content-tabs">
      <div role="tablist" className="tabs-list">
        {labels.map((label, i) => (
          <button
            key={label}
            type="button"
            role="tab"
            id={`${id}-tab-${i}`}
            aria-controls={`${id}-panel-${i}`}
            aria-selected={label === active}
            className="tabs-trigger"
            onClick={() => setPreferred(label)}
          >
            {label}
          </button>
        ))}
      </div>
      {/* Inactive panels stay in the DOM so their text is in the prerendered HTML. */}
      {tabs.map((tab, i) => (
        <div
          key={tab.props.label}
          role="tabpanel"
          id={`${id}-panel-${i}`}
          aria-labelledby={`${id}-tab-${i}`}
          hidden={tab.props.label !== active}
        >
          {tab.props.children}
        </div>
      ))}
    </div>
  );
}
