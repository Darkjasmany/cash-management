import api from "@/api/client";
import { handleError } from "@/api/utils";

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "ORGANIZER";
  isActive: boolean;
  createdAt: string;
};

export type CreateUserInput = {
  name: string;
  email: string;
  password: string;
  role: "ADMIN" | "ORGANIZER";
};

export type UpdateUserInput = {
  name?: string;
  role?: "ADMIN" | "ORGANIZER";
  isActive?: boolean;
};

export async function getUsers(): Promise<AdminUser[]> {
  try {
    const { data } = await api.get("/admin/users");
    return data.data;
  } catch (error) {
    handleError(error);
  }
}

export async function createUser(input: CreateUserInput): Promise<AdminUser> {
  try {
    const { data } = await api.post("/admin/users", input);
    return data.data;
  } catch (error) {
    handleError(error);
  }
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<AdminUser> {
  try {
    const { data } = await api.patch(`/admin/users/${id}`, input);
    return data.data;
  } catch (error) {
    handleError(error);
  }
}

export async function changeUserPassword(id: string, newPassword: string): Promise<void> {
  try {
    await api.patch(`/admin/users/${id}/password`, { newPassword });
  } catch (error) {
    handleError(error);
  }
}

export async function deleteUser(id: string): Promise<void> {
  try {
    await api.patch(`/admin/users/${id}/deleted`);
  } catch (error) {
    handleError(error);
  }
}

export async function deletedUserDefinite(id: string): Promise<void> {
  try {
    await api.delete(`/admin/users/${id}`);
  } catch (error) {
    handleError(error);
  }
}
