import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  createSchema,
  inputStyles,
  labelStyles,
  type CreateUserFormValues,
} from "../schema/Admin.schema";

interface Props {
  onSubmit: (data: CreateUserFormValues) => void;
  isPending: boolean;
  onCancel: () => void;
}

const CreateUserForm = ({ onSubmit, isPending, onCancel }: Props) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateUserFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { role: "ORGANIZER" },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div>
        <label className={labelStyles}>Nombre completo *</label>
        <input className={inputStyles(!!errors.name)} {...register("name")} />
        {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name.message}</p>}
      </div>

      <div>
        <label className={labelStyles}>Email *</label>
        <input type="email" className={inputStyles(!!errors.email)} {...register("email")} />
        {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>}
      </div>

      <div>
        <label className={labelStyles}>Contraseña *</label>
        <input
          type="password"
          className={inputStyles(!!errors.password)}
          {...register("password")}
        />
        {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>}
      </div>

      <div>
        <label className={labelStyles}>Rol *</label>
        <select className={inputStyles(false)} {...register("role")}>
          <option value="ORGANIZER">Organizador</option>
          <option value="ADMIN">Administrador</option>
        </select>
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
          {isPending ? "Creando..." : "Crear usuario"}
        </button>
      </div>
    </form>
  );
};

export default CreateUserForm;
