import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useScope, withScope } from "../../scope";
import {
  type NavNode,
  navPlacement,
  PROJECT_LABELS,
  useManifestNav,
  useScopedDocNav,
} from "../../sidebar";
import { useSidebar } from "./Shell";

interface DocsSidebarProps {
  activeProject?: string;
  activeBucket?: string;
  activeSlug?: string;
}

export default function DocsSidebar({ activeProject, activeBucket, activeSlug }: DocsSidebarProps) {
  const location = useLocation();
  const { mobileOpen, setMobileOpen } = useSidebar();
  const { scopeId } = useScope();
  // Viewer- AND scope-aware nav: anonymous viewers see only published docs, and
  // the active scope narrows the rail to that topic's project(s). The doc being
  // read is pinned via `activeProject` so it never drops out under a mismatched
  // `?scope=`. While the drafts list resolves the nav is empty, so show a
  // placeholder instead of an empty rail (matches the overview surfaces).
  const { nav, isLoading } = useScopedDocNav(scopeId, activeProject);
  // A doc pinned in from another project under a mismatched `?scope=` falls back
  // to the Diátaxis rail, where its own group is kept.
  const manifest = useManifestNav(scopeId);
  const useManifest = manifest && (!activeProject || activeProject === manifest.project);
  // Track explicit open/closed choices; absent keys fall back to "open when
  // this is the active project/bucket" so the current page stays reachable.
  const [projectOpen, setProjectOpen] = useState<Record<string, boolean>>({});
  const [bucketOpen, setBucketOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!activeProject) return;
    setProjectOpen((prev) => ({ ...prev, [activeProject]: true }));
    if (activeBucket) {
      setBucketOpen((prev) => ({
        ...prev,
        [`${activeProject}/${activeBucket}`]: true,
      }));
    }
  }, [activeProject, activeBucket]);

  const isActive = (href: string) => location.pathname === href;

  function isProjectExpanded(project: string) {
    if (project in projectOpen) return projectOpen[project];
    return !activeProject || project === activeProject;
  }

  function isBucketExpanded(project: string, bucket: string) {
    const key = `${project}/${bucket}`;
    if (key in bucketOpen) return bucketOpen[key];
    return project === activeProject && bucket === activeBucket;
  }

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`} aria-label="Docs navigation">
        <div className="sidebar-inner">
          <Link to="/docs" className="sidebar-home" onClick={() => setMobileOpen(false)}>
            Documentation
          </Link>
          {useManifest ? (
            <ManifestTree
              project={manifest.project}
              tree={manifest.tree}
              isLoading={manifest.isLoading}
              activeHref={location.pathname}
              scopeId={scopeId}
              onNavigate={() => setMobileOpen(false)}
            />
          ) : (
            <>
              {isLoading && nav.length === 0 && <p className="sidebar-empty muted">Loading…</p>}
              {!isLoading && nav.length === 0 && (
                <p className="sidebar-empty muted">No published docs yet.</p>
              )}
              {nav.map((group) => {
                const projectExpanded = isProjectExpanded(group.project);
                return (
                  <Collapsible
                    key={group.project}
                    open={projectExpanded}
                    onOpenChange={(open) =>
                      setProjectOpen((prev) => ({ ...prev, [group.project]: open }))
                    }
                    className="sidebar-section"
                  >
                    <CollapsibleTrigger
                      className={cn("sidebar-project", group.project === activeProject && "active")}
                    >
                      <span>{group.projectLabel}</span>
                      <ChevronDown
                        className={cn("sidebar-chevron", projectExpanded && "open")}
                        aria-hidden
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      {group.buckets.map((bucket) => {
                        const bucketKey = `${group.project}/${bucket.bucket}`;
                        const bucketExpanded = isBucketExpanded(group.project, bucket.bucket);
                        const bucketActive =
                          activeProject === group.project && activeBucket === bucket.bucket;
                        return (
                          <Collapsible
                            key={bucket.bucket}
                            open={bucketExpanded}
                            onOpenChange={(open) =>
                              setBucketOpen((prev) => ({ ...prev, [bucketKey]: open }))
                            }
                            className="sidebar-bucket"
                          >
                            <CollapsibleTrigger
                              className={cn("sidebar-bucket-label", bucketActive && "active")}
                            >
                              <span>{bucket.label}</span>
                              <ChevronDown
                                className={cn("sidebar-chevron", bucketExpanded && "open")}
                                aria-hidden
                              />
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <ul className="sidebar-links">
                                {bucket.items.map((item) => {
                                  const active =
                                    activeSlug === item.slug &&
                                    activeProject === item.project &&
                                    activeBucket === item.bucket;
                                  return (
                                    <li key={item.href}>
                                      <Link
                                        to={withScope(item.href, scopeId)}
                                        className={
                                          active || isActive(item.href)
                                            ? "sidebar-link active"
                                            : "sidebar-link"
                                        }
                                        aria-current={active ? "page" : undefined}
                                        onClick={() => setMobileOpen(false)}
                                      >
                                        {item.label}
                                      </Link>
                                    </li>
                                  );
                                })}
                              </ul>
                            </CollapsibleContent>
                          </Collapsible>
                        );
                      })}
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </>
          )}
        </div>
      </aside>
    </>
  );
}

interface ManifestTreeProps {
  project: string;
  tree: NavNode[];
  isLoading: boolean;
  activeHref: string;
  scopeId: string;
  onNavigate: () => void;
}

/** MkDocs-style rail for a project's nav.yml: top-level sections are headings,
 * nested sections collapse, and only a page's primary placement is marked
 * current (cross-links elsewhere stay plain). */
function ManifestTree({
  project,
  tree,
  isLoading,
  activeHref,
  scopeId,
  onNavigate,
}: ManifestTreeProps) {
  // Section keys are their label trail; the active page's trail opens by default.
  const activeKeys = useMemo(() => {
    const trail = navPlacement(tree, activeHref)?.trail ?? [];
    return new Set(trail.map((_, i) => trail.slice(0, i + 1).join("/")));
  }, [tree, activeHref]);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  if (tree.length === 0) {
    return (
      <p className="sidebar-empty muted">{isLoading ? "Loading…" : "No published docs yet."}</p>
    );
  }

  const isOpen = (key: string, depth: number) =>
    key in open ? open[key] : activeKeys.has(key) || (depth === 0 && activeKeys.size === 0);

  const renderNodes = (nodes: NavNode[], trail: string[]) => (
    <ul className="sidebar-links">
      {nodes.map((node) => {
        if (node.kind === "planned") {
          return (
            <li key={`planned:${node.id}`}>
              <span className="sidebar-link planned" title="Planned — not written yet">
                {node.title}
                <span className="sidebar-planned-id">{node.id}</span>
              </span>
            </li>
          );
        }
        if (node.kind === "page") {
          const current = node.primary && node.item.href === activeHref;
          return (
            <li key={`${trail.join("/")}:${node.item.href}`}>
              <Link
                to={withScope(node.item.href, scopeId)}
                className={current ? "sidebar-link active" : "sidebar-link"}
                aria-current={current ? "page" : undefined}
                onClick={onNavigate}
              >
                {node.item.label}
              </Link>
            </li>
          );
        }
        return <li key={`section:${node.label}`}>{renderSection(node, trail)}</li>;
      })}
    </ul>
  );

  const renderSection = (node: Extract<NavNode, { kind: "section" }>, parent: string[]) => {
    const trail = [...parent, node.label];
    const key = trail.join("/");
    const depth = parent.length;
    const expanded = isOpen(key, depth);
    return (
      <Collapsible
        open={expanded}
        onOpenChange={(next) => setOpen((prev) => ({ ...prev, [key]: next }))}
        className={depth === 0 ? "sidebar-section" : "sidebar-bucket"}
      >
        <CollapsibleTrigger
          className={cn(
            depth === 0 ? "sidebar-project" : "sidebar-bucket-label",
            activeKeys.has(key) && "active",
          )}
        >
          <span>{node.label}</span>
          <ChevronDown className={cn("sidebar-chevron", expanded && "open")} aria-hidden />
        </CollapsibleTrigger>
        <CollapsibleContent>{renderNodes(node.children, trail)}</CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <nav aria-label={`${PROJECT_LABELS[project] ?? project} navigation`}>
      {tree.map((node) =>
        node.kind === "section" ? (
          <div key={`section:${node.label}`}>{renderSection(node, [])}</div>
        ) : (
          <div
            key={node.kind === "page" ? node.item.href : `planned:${node.id}`}
            className="sidebar-section"
          >
            {renderNodes([node], [])}
          </div>
        ),
      )}
    </nav>
  );
}
