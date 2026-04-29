import { useState } from "react";
import type { AdminUser } from "../api/admin.api";
import type { CreateUserFormValues, EditUserFormValues } from "../components/UserForm";
import UserForm from "../components/UserForm";
import UserModal from "../components/UserModal";
import {
  useAdminUser,
  useChangePassword,
  useCreateUser,
  useDeleteUser,
  useDeleteUserDefinite,
  useUpdateUser,
} from "../hooks/useAdminUsers";

type ModalMode = "create" | "edit" | "password" | null;

const UsersPage = () => {
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const { data: users = [], isLoading } = useAdminUser();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const changePassword = useChangePassword();
  const deleteUser = useDeleteUser();
  const deleteUserDefinitive = useDeleteUserDefinite();

  const handleClose = () => {
    setModalMode(null);
    setSelectedUser(null);
    setNewPassword("");
  };

  const handleCreate = (data: CreateUserFormValues) => {
    createUser.mutate(data, { onSuccess: handleClose });
  };

  const handleEdit = (data: EditUserFormValues) => {
    if (!selectedUser) return;
    updateUser.mutate({ id: selectedUser.id, input: data }, { onSuccess: handleClose });
  };

  const handleChangePassword = () => {
    if (!selectedUser || newPassword.length < 8) return;
    changePassword.mutate(
      { id: selectedUser.id, password: newPassword },
      { onSuccess: handleClose }
    );
  };

  const handleDelete = (user: AdminUser) => {
    if (!window.confirm(`¿Eliminar al usuario "${user.name}"? Esta acción no se puede deshacer.`))
      return;
    deleteUser.mutate(user.id);
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Usuarios</h1>
          <p className="">Gestiona los accesos al sistema</p>
        </div>
        <button
          onClick={() => setModalMode("create")}
          className="bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium
                     px-4 py-2 rounded-lg transition"
        >
          + Nuevo usuario
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            Cargando usuarios...
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left py-3 px-4 text-slate-400 font-medium">Usuario</th>
                <th className="text-left py-3 px-4 text-slate-400 font-medium">Rol</th>
                <th className="text-left py-3 px-4 text-slate-400 font-medium">Estado</th>
                <th className="text-left py-3 px-4 text-slate-400 font-medium">Creado</th>
                <th className="text-right py-3 px-4 text-slate-400 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr
                  key={user.id}
                  className="border-b border-slate-800/50 hover:bg-slate-800/30 transition"
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full bg-sky-900 flex items-center
                                      justify-center text-xs text-sky-400 font-medium shrink-0"
                      >
                        {user.name
                          .split(" ")
                          .map(n => n[0])
                          .join("")
                          .slice(0, 2)}
                      </div>
                      <div>
                        <p className="text-white font-medium">{user.name}</p>
                        <p className="text-slate-500 text-xs">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`
                      text-xs px-2 py-1 rounded-md
                      ${
                        user.role === "ADMIN"
                          ? "bg-purple-900/50 text-purple-400"
                          : "bg-slate-800 text-slate-400"
                      }
                    `}
                    >
                      {user.role === "ADMIN" ? "Administrador" : "Organizador"}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`
                      text-xs px-2 py-1 rounded-md
                      ${
                        user.isActive
                          ? "bg-green-900/50 text-green-400"
                          : "bg-red-900/50 text-red-400"
                      }
                    `}
                    >
                      {user.isActive ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-400">
                    {new Date(user.createdAt).toLocaleDateString("es-EC")}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => {
                          setSelectedUser(user);
                          setModalMode("edit");
                        }}
                        className="text-xs px-3 py-1.5 rounded-md bg-slate-800
                                   hover:bg-slate-700 text-slate-300 transition"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => {
                          setSelectedUser(user);
                          setModalMode("password");
                        }}
                        className="text-xs px-3 py-1.5 rounded-md bg-slate-800
                                   hover:bg-slate-700 text-amber-400 transition"
                      >
                        Contraseña
                      </button>
                      <button
                        onClick={() => handleDelete(user)}
                        className="text-xs px-3 py-1.5 rounded-md bg-red-900/30
                                   hover:bg-red-900/50 text-red-400 transition"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal crear */}
      <UserModal isOpen={modalMode === "create"} title="Nuevo usuario" onClose={handleClose}>
        <UserForm
          mode="create"
          onSubmit={handleCreate}
          isPending={createUser.isPending}
          onCancel={handleClose}
        />
      </UserModal>

      {/* Modal editar */}
      <UserModal
        isOpen={modalMode === "edit" && !!selectedUser}
        title="Editar usuario"
        onClose={handleClose}
      >
        {selectedUser && (
          <UserForm
            mode="edit"
            defaultValues={selectedUser}
            onSubmit={handleEdit}
            isPending={updateUser.isPending}
            onCancel={handleClose}
          />
        )}
      </UserModal>

      {/* Modal cambiar contraseña */}
      <UserModal
        isOpen={modalMode === "password" && !!selectedUser}
        title={`Cambiar contraseña — ${selectedUser?.name}`}
        onClose={handleClose}
      >
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Nueva contraseña</label>
            <input
              type="password"
              placeholder="Mínimo 8 caracteres"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-slate-800 border
                         border-slate-700 text-white text-sm
                         focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="flex-1 h-10 rounded-lg border border-slate-700
                         text-slate-400 hover:bg-slate-800 transition text-sm"
            >
              Cancelar
            </button>
            <button
              onClick={handleChangePassword}
              disabled={newPassword.length < 8 || changePassword.isPending}
              className="flex-1 h-10 rounded-lg bg-amber-600 hover:bg-amber-500
                         disabled:opacity-50 text-white font-medium transition text-sm"
            >
              {changePassword.isPending ? "Actualizando..." : "Actualizar"}
            </button>
          </div>
        </div>
      </UserModal>
    </div>
  );
};

export default UsersPage;
