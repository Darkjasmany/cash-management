import { formatDate } from "@/helpers";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

const cuttingSchema = z.object({
  fechaCorte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
});
export type CuttingFormValue = z.infer<typeof cuttingSchema>;

type Props = {
  onSubmit: (data: CuttingFormValue) => void;
  isPending: boolean;
};

const CutForm = ({ isPending, onSubmit }: Props) => {
  const dateNow = formatDate(new Date());

  const {
    register,
    reset,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(cuttingSchema),
    defaultValues: { fechaCorte: dateNow },
  });

  const handleInternalSubmit = (data: CuttingFormValue) => {
    onSubmit(data);
    reset();
  };
  return (
    <form action="" onSubmit={handleSubmit(handleInternalSubmit)} className="flex flex-col gap-1">
      <div className="flex gap-3">
        <input
          {...register("fechaCorte")}
          type="date"
          className="h-10 px-3 rounded-lg bg-slate-800 border border-slate-700 text-white flex-1 focus:ring-2 focus:ring-sky-500 outline-none transition"
        />

        <button
          type="submit"
          disabled={isPending}
          className="h-10 px-4 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition cursor-pointer"
        >
          {isPending ? "Procesando..." : "Procesar"}
        </button>
        {errors.fechaCorte && (
          <span className="text-red-400 text-xs mt-1">{errors.fechaCorte.message}</span>
        )}
      </div>
    </form>
  );
};

export default CutForm;
