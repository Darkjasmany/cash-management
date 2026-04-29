import { useAuthStore } from "@/store/auth.store";
import { useNavigate } from "react-router-dom";

const Navbar = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/auth/login");
  };

  return (
    <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-2">
        <span className="select-none">
          Fútbol<span className="text-sky-400">System</span>
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right select-none">
          <p className="text-sm font-medium text-white">{user?.name}</p>
          <p className="text-xs text-slate-400">{user?.role}</p>
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-slate-400 hover:text-red-400 transition-colors px-3 py-1.5 rounded-md hover:bg-slate-800 hover:cursor-pointer "
        >
          Cerrar sesión
        </button>
      </div>
    </header>
  );
};

export default Navbar;
