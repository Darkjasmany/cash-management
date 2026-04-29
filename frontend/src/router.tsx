import { AuthRoutes } from "@/features/auth/AuthRoutes";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import DashboardLayout from "./layouts/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import { useAuthStore } from "./store/auth.store";


function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated());
  return isAuthenticated ? <>{children}</> : <Navigate to="/auth/login" replace />;
}

export default function Router(){
    return(
        <BrowserRouter>
      <Routes>
        <Route path="/auth/*" element={<AuthRoutes />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <DashboardLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<Dashboard />} />
          {/* Aquí irán las rutas de cada módulo cuando los construyamos */}
          {/* <Route path="teams" element={<TeamsPage />} />
          <Route path="players" element={<PlayersPage />} />
          <Route path="players/:id/report" element={<PlayerReportPage />} />
          <Route path="matches" element={<MatchesPage />} />
          <Route path="matches/:id/flow" element={<MatchFlowPage />} />
          <Route path="admin/categories" element={<CategoriesPage />} />
          <Route path="admin/users" element={<UsersPage />} /> */}
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    )
}