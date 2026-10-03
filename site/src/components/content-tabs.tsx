// Renders a `:::tab` group (see src/plugins/remark-tabs.mjs). Groups sync by
// label: choosing "CLI" in one group switches every group that has a "CLI" tab,
// and the choice persists across pages, like MkDocs Material's linked tabs.
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useSyncExternalStore,
} from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const STORAGE_KEY = "docs-factory:content-tab";
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
  const preferred = useSyncExternalStore(subscribe, readPreferred, () => null);
  const active = preferred && labels.includes(preferred) ? preferred : labels[0];

  return (
    <Tabs value={active} onValueChange={setPreferred} className="content-tabs my-4">
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
