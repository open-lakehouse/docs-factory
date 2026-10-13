// Renders a `:::tab` group (see src/plugins/remark-tabs.mjs). Groups sync by
// label: choosing "CLI" in one group switches every group that has a "CLI" tab,
// and the choice persists across pages, like MkDocs Material's linked tabs.
// `<Engine> · <Language>` groups sync per axis instead (src/lib/tab-axes.ts):
// an engine row, then that engine's languages.
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useSyncExternalStore,
} from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type AxisPrefs,
  type AxisTab,
  axisTabs,
  choose,
  engines,
  parsePrefs,
  pick,
  pickForEngine,
} from "@/lib/tab-axes";

const LABEL_KEY = "docs-factory:content-tab";
const AXES_KEY = "docs-factory:content-tab-axes";
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
  const labels = tabs.map((t) => t.props.label);
  const axes = axisTabs(labels);
  return axes ? <AxisTabs tabs={tabs} axes={axes} /> : <LabelTabs tabs={tabs} labels={labels} />;
}

function LabelTabs({ tabs, labels }: { tabs: ReactElement<ContentTabProps>[]; labels: string[] }) {
  const preferred = useSyncExternalStore(
    subscribe,
    () => read(LABEL_KEY),
    () => null,
  );
  const active = preferred && labels.includes(preferred) ? preferred : labels[0];

  return (
    <Tabs value={active} onValueChange={(v) => write(LABEL_KEY, v)} className="content-tabs my-4">
      <TabsList variant="line">
        {labels.map((label) => (
          <TabsTrigger key={label} value={label}>
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
      {/* forceMount keeps inactive panels in the DOM: review highlights and
          anchors resolve against the article's text, including hidden tabs. */}
      {tabs.map((tab) => (
        <TabsContent
          key={tab.props.label}
          value={tab.props.label}
          forceMount
          hidden={tab.props.label !== active}
        >
          {tab.props.children}
        </TabsContent>
      ))}
    </Tabs>
  );
}

function AxisTabs({ tabs, axes }: { tabs: ReactElement<ContentTabProps>[]; axes: AxisTab[] }) {
  // The raw string is the snapshot: it compares stable between renders.
  const raw = useSyncExternalStore(
    subscribe,
    () => read(AXES_KEY),
    () => null,
  );
  const prefs: AxisPrefs = parsePrefs(raw);
  const active = pick(axes, prefs);
  const panel = new Map(tabs.map((t) => [t.props.label, t.props.children]));
  const select = (tab: AxisTab) => write(AXES_KEY, JSON.stringify(choose(prefs, tab)));

  return (
    <Tabs
      value={active.engine}
      onValueChange={(engine) => select(pickForEngine(axes, engine, prefs))}
      className="content-tabs my-4"
    >
      <TabsList variant="line">
        {engines(axes).map((engine) => (
          <TabsTrigger key={engine} value={engine}>
            {engine}
          </TabsTrigger>
        ))}
      </TabsList>
      {engines(axes).map((engine) => {
        const own = axes.filter((t) => t.engine === engine);
        const shown = pickForEngine(axes, engine, prefs);
        return (
          <TabsContent key={engine} value={engine} forceMount hidden={engine !== active.engine}>
            <Tabs
              value={shown.language}
              onValueChange={(language) => {
                const tab = own.find((t) => t.language === language);
                if (tab) select(tab);
              }}
            >
              {/* Pills under the engine's line tabs, so the rows read as two levels. */}
              <TabsList className="group-data-[orientation=horizontal]/tabs:h-8">
                {own.map((t) => (
                  <TabsTrigger key={t.language} value={t.language} className="text-xs">
                    {t.language}
                  </TabsTrigger>
                ))}
              </TabsList>
              {own.map((t) => (
                <TabsContent
                  key={t.language}
                  value={t.language}
                  forceMount
                  hidden={t.language !== shown.language}
                >
                  {panel.get(t.label)}
                </TabsContent>
              ))}
            </Tabs>
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
