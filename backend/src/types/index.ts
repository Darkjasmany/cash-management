// ─── Fila que devuelve GET_DEUDAS_SIIM_SQL ───────────────────
// UNA fila por factura (el query ordena por fecha ASC)
export interface FilaSiim {
  id_factura: number;
  id_modulo: number;
  fecha_creacion: Date;
  id_cliente: number;
  cedula: string;
  nombre_cliente: string;
  total_nominal: number;
  servicio_administrativo: number;
  bomberos: number;
  impuesto_predial: number; // nuevo
  exoneracion: number; // nuevo
  cem?: number; // opcional, solo rural
  base_predial_pura: number; // mantenemos por compatibilidad
  contrapartida: string;
  referencia: string;
}

// ─── Registro consolidado listo para guardar / exportar ──────
export interface RegistroDeuda {
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

// ─── Resultado del proceso ────────────────────────────────────
export interface ResultadoProceso {
  idParametro: number;
  fechaCorte: string;
  totalRegistros: number;
  totalDeuda: number;
}

// ─── Interés del SIIM por periodo ────────────────────────────
export interface InteresisSiim {
  ano: number;
  mes: number;
  porcentaje: number;
}

// ─── Módulo del SIIM ──────────────────────────────────────────
export interface ModuloSiim {
  id: number;
  periodicidad: number;
  porcentaje: number;
  diasAdicionales: number;
}

export interface CuttingParams {
  id: number;
  fechaCorte: string;
  estado: string;
  creadoPor: number;
  nombreUsuario: string;
  creadoEn: string;
}

export interface ResumenModuloDashboard {
  id_modulo: number;
  modulo: string;
  totalClientes: number;
  totalDeuda: number;
}
