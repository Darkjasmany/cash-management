import api from "@/api/client";
import { handleError } from "@/api/utils";

export interface ResultadoProceso {
  success: boolean;
  message: string;
  data: {
    idParametro: number;
    fechaCorte: string;
    totalRegistros: number;
    totalDeuda: number;
  };
}

export interface RegistroDeuda {
  id: number;
  tipo: string;
  contrapartida: string;
  moneda: string;
  valor: number;
  formaCobro: string;
  ref1: string;
  ref2: string;
  referencia: string;
  tipoId: string;
  numeroId: string;
  nombreCliente: string;
  idCliente: string;
  totalDecimal: number;
  montoNominal?: number;
  montoInteres?: number;
  montoMora?: number;
  montoDescuento?: number;
  montoRecargo?: number;
}

export interface CorteActivo {
  corte: {
    id: number;
    fechaCorte: string;
    creadoEn: string;
    nombreUsuario: string;
  };
  deudas: RegistroDeuda[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  resumen: {
    totalRegistros: number;
    totalDeuda: string | number;
  };
}

export interface Cortes {
  id: number;
  fechaCorte: String;
  totalDeuda: String;
  totalRegistros: String;
  estado: string;
  creadoPor: number;
  nombreUsuario: string;
  creadoEn: String;
}

export async function proccessCutting(fechaCorte: string): Promise<ResultadoProceso> {
  try {
    const { data } = await api.post("/cut/procesar", { fechaCorte });
    return data;
  } catch (error) {
    handleError(error);
  }
}

export async function getActiveCutting(page = 1, limit = 50): Promise<CorteActivo> {
  try {
    const { data } = await api.get("/cut/activo", { params: { page, limit } });
    return data;
  } catch (error) {
    handleError(error);
  }
}

export async function getCuttings(): Promise<Cortes[]> {
  try {
    const { data } = await api.get("/cut/cortes");
    return data.data;
  } catch (error) {
    handleError(error);
  }
}

export async function dowloadTxt() {
  try {
    // {responseType: 'blob'} en axios sirve para indicarle a la librería que la respuesta del servidor debe tratarse como un objeto Blob (Binary Large Object) en lugar del JSON predeterminado. Esto es indispensable para descargar archivos, manejar imágenes, PDFs o cualquier dato binario recibido de una API
    const response = await api.get("/cut/descargar/txt", { responseType: "blob" });
    const url = URL.createObjectURL(new Blob([response.data], { type: "text/plain" }));
    const link = document.createElement("a"); // creamos un enlace invisible en la memoria
    link.href = url; //Le asignamos la dirección de la memoria RAM que creamos arriba.
    link.download = `deudas_${new Date().toISOString().split("T")[0].replace(/-/g, "")}.txt`; // Le dice al navegador: "No abras este archivo en una pestaña nueva, descárgalo con este nombre específico"
    link.click(); //Simulamos el dedo del usuario haciendo clic. Esto dispara la ventana de "Guardar como"
    URL.revokeObjectURL(url); //Ya terminamos, puedes liberar esa memoria y olvidar esa dirección temporal
  } catch (error) {
    handleError(error);
  }
}

export async function dowloadExcel() {
  try {
    const response = await api.get("/cut/descargar/xlsx", { responseType: "blob" });
    const url = URL.createObjectURL(
      new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `deudas_${new Date().toISOString().split("T")[0].replace(/-/g, "")}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    handleError(error);
  }
}
