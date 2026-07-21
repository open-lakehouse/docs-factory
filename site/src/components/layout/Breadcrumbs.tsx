import { Link } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, ChevronDown } from "lucide-react";
import { Fragment } from "react";

export interface BreadcrumbSibling {
  label: string;
  href: string;
}

export interface BreadcrumbItemData {
  label: string;
  href?: string;
  siblings?: BreadcrumbSibling[];
  activeHref?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItemData[];
  className?: string;
}

export function CrumbDropdown({
  item,
  isCurrent,
}: {
  item: BreadcrumbItemData;
  isCurrent: boolean;
}) {
  const siblings = item.siblings ?? [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={isCurrent ? "crumb-trigger crumb-trigger-current" : "crumb-trigger"}
        aria-current={isCurrent ? "page" : undefined}
      >
        <span>{item.label}</span>
        <ChevronDown className="crumb-caret" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="crumb-menu" align="start">
        {siblings.map((sib) => {
          const active = sib.href === item.activeHref;
          return (
            <DropdownMenuItem key={sib.href} asChild className={active ? "crumb-menu-item active" : "crumb-menu-item"}>
              <Link to={sib.href} aria-current={active ? "page" : undefined}>
                <Check
                  className="crumb-menu-check"
                  aria-hidden="true"
                  style={{ visibility: active ? "visible" : "hidden" }}
                />
                <span className="crumb-menu-label">{sib.label}</span>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PathSeparator() {
  return (
    <li
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      className="breadcrumb-path-sep"
    >
      /
    </li>
  );
}

export default function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  return (
    <Breadcrumb className={className ? `breadcrumbs ${className}` : "breadcrumbs"}>
      <BreadcrumbList>
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          const hasSiblings = (item.siblings?.length ?? 0) > 0;

          return (
            <Fragment key={`${item.label}-${i}`}>
              {i > 0 && <PathSeparator />}
              <BreadcrumbItem>
                {hasSiblings ? (
                  <CrumbDropdown item={item} isCurrent={isLast} />
                ) : item.href && !isLast ? (
                  <BreadcrumbLink asChild>
                    <Link to={item.href}>{item.label}</Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>{item.label}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
