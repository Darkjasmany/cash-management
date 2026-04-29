import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { AiOutlineLock } from "react-icons/ai";
import { IoMdEye, IoMdEyeOff } from "react-icons/io";
import { MdEmail } from "react-icons/md";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { authenticateUser } from "../api/auth.api";
import { loginSchema, type LoginInput } from "../schema/auth.schema";

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(true);
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const { mutate, isPending } = useMutation({
    mutationFn: authenticateUser,
    onError: error => toast.error(error.message),
    onSuccess: () => {
      toast.success("¡Inicio de sesión exitoso!");
      navigate("/");
    },
  });

  return (
    <>
      <h2 className="text-2xl font-semibold text-center mb-6 text-sky-400">Inicia Sesión</h2>

      <form className="space-y-5" onSubmit={handleSubmit(data => mutate(data))}>
        {/* Email */}
        <div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <MdEmail />
            </span>
            <input
              type="email"
              placeholder="Correo electrónico"
              autoComplete="email"
              className={`pl-10 pr-4 h-12 w-full rounded-md bg-slate-900/60 text-white border 
                placeholder:text-slate-400 focus:outline-none focus:ring-2 transition
                ${
                  errors.email
                    ? "border-red-500 focus:ring-red-500"
                    : "border-slate-600 focus:ring-sky-500"
                }`}
              {...register("email")}
            />
          </div>
          {errors.email && <p className="text-red-400 text-sm mt-1">{errors.email.message}</p>}
        </div>

        {/* Password */}
        <div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <AiOutlineLock />
            </span>
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Contraseña"
              autoComplete="current-password"
              className={`pl-10 pr-10 h-12 w-full rounded-md bg-slate-900/60 text-white border
                placeholder:text-slate-400 focus:outline-none focus:ring-2 transition
                ${
                  errors.password
                    ? "border-red-500 focus:ring-red-500"
                    : "border-slate-600 focus:ring-sky-500"
                }`}
              {...register("password")}
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <IoMdEyeOff /> : <IoMdEye />}
            </button>
          </div>
          {errors.password && (
            <p className="text-red-400 text-sm mt-1">{errors.password.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-50 
            disabled:cursor-not-allowed text-white font-bold py-3 rounded-md transition-all"
        >
          {isPending ? "Iniciando sesión..." : "INICIAR SESIÓN"}
        </button>
      </form>
    </>
  );
}
