import { NavLink } from "react-router-dom";
import { type NavItem, site } from "../../site";

function Items({ items, depth }: { items: NavItem[]; depth: number }) {
  return (
    <ul className="nav-list" data-depth={depth}>
      {items.map((item) =>
        item.kind === "page" ? (
          <li key={item.route}>
            <NavLink to={item.route} className="nav-link" end>
              {item.label}
            </NavLink>
          </li>
        ) : (
          <li key={item.label} className="nav-section">
            <p className="nav-section-label">{item.label}</p>
            <Items items={item.items} depth={depth + 1} />
          </li>
        ),
      )}
    </ul>
  );
}

export default function Sidebar() {
  return (
    <nav className="sidebar" aria-label="Documentation">
      <Items items={site.nav} depth={0} />
    </nav>
  );
}
