// Which panel a `:::tab` group shows. A group whose every label reads
// `<Engine> · <Language>` is picked on two axes: the reader's engine, then the
// language they last chose for that engine (or last chose at all). Any other
// group matches its stored label exactly.
//
// site/src/lib/ and sites/docs-shell/src/lib/ hold byte-identical copies of this
// file; site/src/lib/tab-axes.test.ts fails when they differ.

export const AXIS_SEPARATOR = " · ";

export interface AxisTab {
  label: string;
  engine: string;
  language: string;
}

export interface AxisPrefs {
  engine?: string;
  language?: string;
  byEngine?: Record<string, string>;
}

/** The group's tabs split on both axes, or null when any label isn't. */
export function axisTabs(labels: string[]): AxisTab[] | null {
  const tabs: AxisTab[] = [];
  for (const label of labels) {
    const at = label.indexOf(AXIS_SEPARATOR);
    if (at <= 0 || at + AXIS_SEPARATOR.length >= label.length) return null;
    tabs.push({
      label,
      engine: label.slice(0, at),
      language: label.slice(at + AXIS_SEPARATOR.length),
    });
  }
  return tabs.length > 0 ? tabs : null;
}

export function engines(tabs: AxisTab[]): string[] {
  return [...new Set(tabs.map((t) => t.engine))];
}

/** The tab to show for one engine. */
export function pickForEngine(tabs: AxisTab[], engine: string, prefs: AxisPrefs): AxisTab {
  const own = tabs.filter((t) => t.engine === engine);
  return (
    own.find((t) => t.language === prefs.byEngine?.[engine]) ??
    own.find((t) => t.language === prefs.language) ??
    own[0]
  );
}

/** The tab to show for the whole group. */
export function pick(tabs: AxisTab[], prefs: AxisPrefs): AxisTab {
  const all = engines(tabs);
  const engine = prefs.engine && all.includes(prefs.engine) ? prefs.engine : all[0];
  return pickForEngine(tabs, engine, prefs);
}

/** The preferences after the reader chooses `tab`. */
export function choose(prefs: AxisPrefs, tab: AxisTab): AxisPrefs {
  return {
    engine: tab.engine,
    language: tab.language,
    byEngine: { ...prefs.byEngine, [tab.engine]: tab.language },
  };
}

export function parsePrefs(raw: string | null): AxisPrefs {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}
