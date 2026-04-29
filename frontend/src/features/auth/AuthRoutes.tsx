import LoginPage from "@/features/auth/pages/LoginPage";
import AuthLayout from "@/layouts/AuthLayout";
import { Navigate, Route, Routes } from "react-router-dom";

export function AuthRoutes() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        {/* Aquí van las rutas de autenticación */}
        <Route path="login" element={<LoginPage />} />

        {/* Si el usuario entra a "/auth" (sin nada más), lo redirigimos automáticamente al login.*/}
        <Route path="" element={<Navigate to="login" replace />} />
      </Route>
    </Routes>
  );
}
