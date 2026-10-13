// A `:::tab` group. Groups sync by label (choosing "CLI" switches every group
// with a "CLI" tab) and the choice persists across pages. `<Engine> · <Language>`
// groups sync per axis instead (../lib/tab-axes.ts): an engine row, then that
// engine's languages.
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useId,
  useSyncExternalStore,
} from "react";
import {
  type AxisPrefs,
  type AxisTab,
  axisTabs,
  choose,
  engines,
  parsePrefs,
  pick,
  pickForEngine,
} from "../lib/tab-axes";

const LABEL_KEY = "docs:content-tab";
const AXES_KEY = "docs:content-tab-axes";
const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); the in-page sync still works.
  }
  for (const notify of listeners) notify();
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  const onStorage = (e: StorageEvent) => (e.key === LABEL_KEY || e.key === AXES_KEY) && notify();
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
  const panels = new Map(tabs.map((t) => [t.props.label, t.props.children]));
  const labels = tabs.map((t) => t.props.label);
  const axes = axisTabs(labels);
  return axes ? <AxisTabs panels={panels} axes={axes} /> : <LabelTabs panels={panels} />;
}

// The server snapshot is null, so prerendered HTML and hydration both start on
// the first tab; the stored preference applies right after.
const useStored = (key: string) =>
  useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );

function LabelTabs({ panels }: { panels: Map<string, ReactNode> }) {
  const labels = [...panels.keys()];
  const preferred = useStored(LABEL_KEY);
  const active = preferred && labels.includes(preferred) ? preferred : labels[0];
  return (
    <div className="content-tabs">
      <TabRow
        items={labels.map((label) => ({ key: label, text: label, panel: panels.get(label) }))}
        active={active}
        onSelect={(label) => write(LABEL_KEY, label)}
      />
    </div>
  );
}

function AxisTabs({ panels, axes }: { panels: Map<string, ReactNode>; axes: AxisTab[] }) {
  const prefs: AxisPrefs = parsePrefs(useStored(AXES_KEY));
  const active = pick(axes, prefs);
  const select = (tab: AxisTab) => write(AXES_KEY, JSON.stringify(choose(prefs, tab)));
  return (
    <div className="content-tabs">
      <TabRow
        items={engines(axes).map((engine) => {
          const own = axes.filter((t) => t.engine === engine);
          const shown = pickForEngine(axes, engine, prefs);
          return {
            key: engine,
            text: engine,
            panel: (
              <TabRow
                className="tabs-list-languages"
                items={own.map((t) => ({
                  key: t.language,
                  text: t.language,
                  panel: panels.get(t.label),
                }))}
                active={shown.language}
                onSelect={(language) => {
                  const tab = own.find((t) => t.language === language);
                  if (tab) select(tab);
                }}
              />
            ),
          };
        })}
        active={active.engine}
        onSelect={(engine) => select(pickForEngine(axes, engine, prefs))}
      />
    </div>
  );
}

interface RowItem {
  key: string;
  text: string;
  panel: ReactNode;
}

function TabRow({
  items,
  active,
  onSelect,
  className,
}: {
  items: RowItem[];
  active: string;
  onSelect: (key: string) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <>
      <div role="tablist" className={className ? `tabs-list ${className}` : "tabs-list"}>
        {items.map((item, i) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            id={`${id}-tab-${i}`}
            aria-controls={`${id}-panel-${i}`}
            aria-selected={item.key === active}
            className="tabs-trigger"
            onClick={() => onSelect(item.key)}
          >
            {item.text}
          </button>
        ))}
      </div>
      {/* Inactive panels stay in the DOM so their text is in the prerendered HTML. */}
      {items.map((item, i) => (
        <div
          key={item.key}
          role="tabpanel"
          id={`${id}-panel-${i}`}
          aria-labelledby={`${id}-tab-${i}`}
          hidden={item.key !== active}
        >
          {item.panel}
        </div>
      ))}
    </>
  );
}
