import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import type { AdminUser } from "../api/admin.api";
import {
  editSchema,
  inputStyles,
  labelStyles,
  type EditUserFormValues,
} from "../schema/Admin.schema";

interface Props {
  defaultValues: AdminUser;
  onSubmit: (data: EditUserFormValues) => void;
  isPending: boolean;
  onCancel: () => void;
}

const EditUserForm = ({ defaultValues, onSubmit, isPending, onCancel }: Props) => {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EditUserFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: defaultValues.name,
      role: defaultValues.role,
      isActive: defaultValues.isActive,
    },
  });

  useEffect(() => {
    reset({
      name: defaultValues.name,
      role: defaultValues.role,
      isActive: defaultValues.isActive,
    });
  }, [defaultValues, reset]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div>
        <label className={labelStyles}>Nombre completo *</label>
        <input className={inputStyles(!!errors.name)} {...register("name")} />
        {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name.message}</p>}
      </div>

      <div>
        <label className={labelStyles}>Rol *</label>
        <select className={inputStyles(false)} {...register("role")}>
          <option value="ORGANIZER">Organizador</option>
          <option value="ADMIN">Administrador</option>
        </select>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="isActive"
          className="w-4 h-4 accent-sky-500"
          {...register("isActive")}
        />
        <label htmlFor="isActive" className="text-sm text-slate-300">
          Usuario activo
        </label>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 h-10 rounded-lg border border-slate-700 text-slate-400 text-sm"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 h-10 rounded-lg bg-sky-600 text-white text-sm"
        >
          {isPending ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
};

export default EditUserForm;
