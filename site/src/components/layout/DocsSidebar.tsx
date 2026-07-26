import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { useVisibleDocNav } from "../../sidebar";
import { useSidebar } from "./Shell";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface DocsSidebarProps {
  activeProject?: string;
  activeBucket?: string;
  activeSlug?: string;
}

export default function DocsSidebar({
  activeProject,
  activeBucket,
  activeSlug,
}: DocsSidebarProps) {
  const location = useLocation();
  const { mobileOpen, setMobileOpen } = useSidebar();
  // Viewer-aware nav: anonymous viewers see only published docs; while the
  // drafts list resolves the nav is empty, so show a placeholder instead of an
  // empty rail (matches the overview surfaces' loading handling).
  const { nav, isLoading } = useVisibleDocNav();
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
          {isLoading && nav.length === 0 && (
            <p className="sidebar-empty muted">Loading…</p>
          )}
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
                  className={cn(
                    "sidebar-project",
                    group.project === activeProject && "active",
                  )}
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
                          className={cn(
                            "sidebar-bucket-label",
                            bucketActive && "active",
                          )}
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
                                    to={item.href}
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
        </div>
      </aside>
    </>
  );
}
