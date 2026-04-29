import { useAuthStore } from "@/store/auth.store";
import { NavLink } from "react-router-dom";

type NavItem = {
  label: string;
  path: string;
  icon: string;
  adminOnly?: boolean;
};

const navItems: NavItem[] = [
  { label: "Dashboard", path: "/", icon: "🏠" },
  { label: "Jugadores", path: "/players", icon: "👥" },
  { label: "Equipos", path: "/teams", icon: "🏆" },
  { label: "Partidos", path: "/matches", icon: "⚽" },
  { label: "Usuarios", path: "/admin/users", icon: "⚙️", adminOnly: true },
  { label: "Categorías", path: "/admin/categories", icon: "🏷️", adminOnly: true },
];

const Sidebar = () => {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "ADMIN";
  const visibleItems = navItems.filter(item => !item.adminOnly || isAdmin);

  return (
    <aside className="w-56 bg-slate-900 border-r border-slate-800 shrink-0">
      <nav className="p-3 flex flex-col gap-1">
        {visibleItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-sky-600 text-white font-medium"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`
            }
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
