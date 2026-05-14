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
  const {
    register,
    reset,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(cuttingSchema),
    defaultValues: { fechaCorte: "" },
  });
  return <div>CutForm</div>;
};

export default CutForm;
