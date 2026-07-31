// A searchable user picker over REGISTERED users (people who have signed in).
// Replaces the old free-text "type a GitHub login" inputs: a reviewer can only
// request a review from — and a maintainer can only grant access to — someone
// who actually exists, resolved by a typeahead against the SearchUsers RPC (our
// user_identity table). Keyed on the stable user id; login/name/email are just
// display.
//
// There is no shadcn `command`/`combobox` in the design system (and `cmdk` isn't
// a dependency), so this is a small hand-rolled combobox on the existing Input +
// a filtered results dropdown, with keyboard nav. Single- or multi-select.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@connectrpc/connect-query";
import { searchUsers } from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { Role, type UserSummary } from "../../gen/docs_factory/review/v1/messages_pb";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

/** Debounce a value by `ms`, so we don't fire a query on every keystroke. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function roleLabel(role: Role): string | null {
  if (role === Role.MAINTAINER) return "Maintainer";
  if (role === Role.REVIEWER) return "Reviewer";
  return null;
}

/** Avatar + name/login + optional role badge for one user row. */
function UserRow({ user }: { user: UserSummary }) {
  const label = roleLabel(user.role);
  const handle = user.githubLogin || user.userId;
  return (
    <span className="user-picker-row-inner">
      <Avatar className="size-6">
        {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={handle} />}
        <AvatarFallback>{(user.name || handle).slice(0, 1).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="user-picker-name">
        {user.name || handle}
        {user.name && <span className="user-picker-login">@{handle}</span>}
      </span>
      {label && (
        <Badge variant={user.role === Role.MAINTAINER ? "default" : "secondary"}>{label}</Badge>
      )}
    </span>
  );
}

export interface UserPickerProps {
  /** Currently selected users (chips). */
  value: UserSummary[];
  onChange: (users: UserSummary[]) => void;
  /** Allow multiple selections (default) or a single one. */
  multiple?: boolean;
  /** Only surface allowlisted users (for the reviewer-request picker). */
  allowlistedOnly?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}

export default function UserPicker({
  value,
  onChange,
  multiple = true,
  allowlistedOnly = false,
  placeholder = "Search people…",
  autoFocus,
}: UserPickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const debouncedQuery = useDebounced(query, 200);
  const boxRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery(
    searchUsers,
    { query: debouncedQuery, limit: 8, allowlistedOnly },
    { enabled: open },
  );

  const selectedIds = useMemo(() => new Set(value.map((u) => u.userId)), [value]);
  // Hide already-selected users from the results.
  const results = (data?.users ?? []).filter((u) => !selectedIds.has(u.userId));

  useEffect(() => setActive(0), [debouncedQuery, open]);

  // Close the dropdown on an outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function pick(user: UserSummary) {
    onChange(multiple ? [...value, user] : [user]);
    setQuery("");
    if (!multiple) setOpen(false);
  }

  function remove(userId: string) {
    onChange(value.filter((u) => u.userId !== userId));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      pick(results[active]);
    } else if (e.key === "Backspace" && query === "" && value.length) {
      remove(value[value.length - 1].userId);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="user-picker" ref={boxRef}>
      {value.length > 0 && (
        <ul className="user-picker-chips">
          {value.map((u) => (
            <li key={u.userId} className="user-picker-chip">
              <UserRow user={u} />
              <button
                type="button"
                className="user-picker-chip-remove"
                aria-label={`Remove ${u.githubLogin || u.userId}`}
                onClick={() => remove(u.userId)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {(multiple || value.length === 0) && (
        <div className="user-picker-input-wrap">
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            autoFocus={autoFocus}
            role="combobox"
            aria-expanded={open}
          />
          {open && results.length > 0 && (
            <ul className="user-picker-results" role="listbox">
              {results.map((u, i) => (
                <li
                  key={u.userId}
                  role="option"
                  aria-selected={i === active}
                  className={i === active ? "user-picker-result active" : "user-picker-result"}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(u);
                  }}
                >
                  <UserRow user={u} />
                </li>
              ))}
            </ul>
          )}
          {open && debouncedQuery.length > 0 && results.length === 0 && (
            <div className="user-picker-empty">No matching people.</div>
          )}
        </div>
      )}
    </div>
  );
}
