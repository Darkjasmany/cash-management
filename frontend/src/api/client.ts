import axios from "axios";
import { useAuthStore } from "../store/auth.store";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:3000/api",
  // headers: { "Content-Type": "application/json" },
});

// Request — agrega el token automáticamente
api.interceptors.request.use(config => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Solo fuerza JSON si no es FormData
  // Si es FormData, el browser pone el Content-Type + boundary correcto solo
  if (!(config.data instanceof FormData)) {
    config.headers["Content-Type"] = "application/json";
  } else {
    // Elimina cualquier Content-Type previo para que el browser lo maneje
    delete config.headers["Content-Type"];
  }
  return config;
});

// Response — maneja el 401 global
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = "/auth/login";
    }
    return Promise.reject(error);
  }
);

export default api;
