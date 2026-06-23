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
    useAuthStore.getState().setAuth(data.data.user, data.data.token);
    return data.data;
  } catch (error) {
    if (isAxiosError(error) && error.response) {
      throw new Error(error.response.data.message ?? "Credenciales inválidas");
    }
    throw new Error("Error de conexión con el servidor");
  }
}
