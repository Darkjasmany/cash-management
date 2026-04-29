import api from "@/api/client";
import { useAuthStore } from "@/store/auth.store";
import { isAxiosError } from "axios";

type LoginResponse = {
  success: boolean;
  data: {
    user: { id: string; name: string; email: string; role: string };
    token: string;
  };
};

export type LoginInput = {
  email: string;
  password: string;
};

export async function authenticateUser(formData: LoginInput) {
  try {
    const { data } = await api.post<LoginResponse>("/auth/login", formData);
    // Guardar en Zustand para mantener la sesión data.data porque axios ya desenvuelve un nivel y el backend envuelve en { success, data: {...} }
    useAuthStore.getState().setAuth(data.data.user, data.data.token);
    return data.data;
  } catch (error) {
    if (isAxiosError(error) && error.response) {
      throw new Error(error.response.data.message ?? "Error al iniciar sesión");
    }
  }
}
