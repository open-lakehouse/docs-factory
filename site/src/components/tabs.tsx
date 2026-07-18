// tabs.tsx — engine-tabbed content groups. remark-tabs emits <Tabs>/<Tab>.
// Uses shadcn Tabs with console styling; syncKey links selection across groups.
import { Children, isValidElement, useEffect, useId, useState, type ReactNode } from "react";
import {
  Tabs as ShadcnTabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  setTabSync,
  subscribeTabSync,
  unsubscribeTabSync,
} from "@/lib/tab-sync";

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
  const tabs = Children.toArray(children).filter(isValidElement) as React.ReactElement<TabProps>[];
  const labels = tabs.map((t) => t.props.label);
  const baseId = useId();
  const [active, setActive] = useState(labels[0] ?? "");

  useEffect(() => {
    if (!syncKey || labels.length === 0) return;
    const onChange = (value: string) => setActive(value);
    const initial = subscribeTabSync(syncKey, labels, onChange);
    setActive(initial);
    return () => unsubscribeTabSync(syncKey, onChange);
  }, [syncKey, labels.join("\0")]);

  const handleChange = (value: string) => {
    setActive(value);
    if (syncKey) setTabSync(syncKey, value);
  };

  if (labels.length === 0) return null;

  return (
    <ShadcnTabs
      value={active}
      onValueChange={handleChange}
      className="tabs"
      data-sync-key={syncKey}
    >
      <TabsList className="tabs-list" aria-label="Tabbed content">
        {labels.map((label, i) => (
          <TabsTrigger key={label} value={label} id={`${baseId}-tab-${i}`} className="tabs-trigger">
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab, i) => (
        <TabsContent
          key={labels[i]}
          value={labels[i]}
          id={`${baseId}-panel-${i}`}
          className="tabs-panel"
          aria-labelledby={`${baseId}-tab-${i}`}
        >
          {tab.props.children}
        </TabsContent>
      ))}
    </ShadcnTabs>
  );
}
