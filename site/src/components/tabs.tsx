// tabs.tsx — engine-tabbed (or arbitrary) content groups. remark-tabs turns
// `::::tabs` / `:::tab[Label]` into <Tabs>/<Tab>. syncKey persists the active
// tab in the URL hash when provided.
import { useControllableState } from "@radix-ui/react-use-controllable-state";
import { useEffect, useId, type ReactNode } from "react";

interface TabProps {
  label: string;
  children: ReactNode;
}

export function Tab({ children }: TabProps) {
  return <>{children}</>;
}

interface TabsProps {
  syncKey?: string;
  children: ReactNode;
}

export function Tabs({ syncKey, children }: TabsProps) {
  const tabs = Array.isArray(children) ? children : [children];
  const items = tabs.filter(Boolean) as React.ReactElement<TabProps>[];
  const labels = items.map((t) => t.props.label);
  const baseId = useId();

  const storageKey = syncKey ? `tabs:${syncKey}` : undefined;
  const [active, setActive] = useControllableState({
    defaultProp: labels[0] ?? "",
    onChange: (v) => {
      if (storageKey && typeof window !== "undefined") {
        try {
          sessionStorage.setItem(storageKey, v);
        } catch {
          /* ignore */
        }
      }
    },
  });

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved && labels.includes(saved)) setActive(saved);
    } catch {
      /* ignore */
    }
  }, [storageKey, labels, setActive]);

  const idx = Math.max(0, labels.indexOf(active ?? labels[0]));

  return (
    <div className="tabs" data-sync-key={syncKey}>
      <div className="tabs-list" role="tablist">
        {labels.map((label, i) => (
          <button
            key={label}
            type="button"
            role="tab"
            id={`${baseId}-tab-${i}`}
            aria-selected={i === idx}
            aria-controls={`${baseId}-panel-${i}`}
            className={i === idx ? "tabs-trigger active" : "tabs-trigger"}
            onClick={() => setActive(label)}
          >
            {label}
          </button>
        ))}
      </div>
      {items.map((item, i) => (
        <div
          key={labels[i]}
          role="tabpanel"
          id={`${baseId}-panel-${i}`}
          aria-labelledby={`${baseId}-tab-${i}`}
          hidden={i !== idx}
          className="tabs-panel"
        >
          {item.props.children}
        </div>
      ))}
    </div>
  );
}
