import { isAxiosError } from "axios";

export function handleError(error: unknown): never {
  if (isAxiosError(error) && error.response) {
    throw new Error(error.response.data.message ?? "Error en la operación");
  }
  throw error;
}
