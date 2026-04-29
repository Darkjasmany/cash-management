import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import {
  changeUserPassword,
  createUser,
  deletedUserDefinite,
  deleteUser,
  getUsers,
  updateUser,
  type UpdateUserInput,
} from "../api/admin.api";

export const USERS_KEY = "admin-users";

export function useAdminUser() {
  return useQuery({
    queryKey: [USERS_KEY],
    queryFn: getUsers,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [USERS_KEY] });
      toast.success("Usuario creado correctamente");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUserInput }) => updateUser(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [USERS_KEY] });
      toast.success("Usuario actualizado correctamente");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      changeUserPassword(id, password),
    onSuccess: () => toast.success("Contraseña actualizada correctamente"),
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [USERS_KEY] });
      toast.success("Usuario eliminado correctamente");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDeleteUserDefinite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deletedUserDefinite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [USERS_KEY] });
      toast.success("Usuario eliminado correctamente");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
