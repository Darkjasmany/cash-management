import { Outlet } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const AuthLayout = () => {
  return (
    <>
      <main className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0a0f1c] text-white px-4">
        <div className="relative z-10 backdrop-blur-xl bg-[#1e293b]/60 p-10 rounded-2xl border border-[#334155]/60 w-full max-w-md">
          <h1 className="text-4xl font-bold text-center mb-1 text-white select-none">
            Fútbol<span className="text-sky-400">System</span>
          </h1>
          <p className="text-center text-slate-400 text-sm mb-6 select-none">
            Sistema de registro de jugadores
          </p>
          <Outlet />
        </div>
      </main>
      <ToastContainer pauseOnHover={false} pauseOnFocusLoss={false} />
    </>
  );
};

export default AuthLayout;
