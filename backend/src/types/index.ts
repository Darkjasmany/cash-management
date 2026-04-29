// ─── Fila cruda que devuelve el SIIM agrupada por cliente ────
export interface FilaSiim {
  id_cliente: number;
  cedula: string;
  tipo_id: string; // 'C' | 'R' | 'P'
  nombre_cliente: string;
  id_modulo: number;
  contrapartida: string; // clave catastral o referencia de agua
  referencia: string; // descripción legible para referencia (ej. "Catastro urbano. Años: 2019, 2020")
  total_deuda: number; // suma de todos los rubros del cliente
  fecha_emision_max: Date; // fecha de emisión más reciente entre las facturas del cliente
}

// ─── Registro consolidado listo para guardar / exportar ──────
export interface RegistroDeuda {
  tipo: string; // "CO"
  contrapartida: number; // 1..4
  moneda: string; // "USD"
  valor: number; // centavos enteros (123.90 → 12390)
  formaCobro: string; // "REC"
  ref1: string; // EN BLANCO
  ref2: string; // EN BLANCO
  referencia: string; // clave catastral / referencia
  tipoId: string; // C | R | P
  numeroId: string; // número de cédula/ruc/pasaporte
  nombreCliente: string;
  idCliente: number;
  totalDecimal: number; // para Excel legible
}

// ─── Resultado del proceso ────────────────────────────────────
export interface ResultadoProceso {
  idParametro: number;
  fechaCorte: string;
  totalRegistros: number;
  totalDeuda: number; // suma en decimal para mostrar
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
  porcentaje: number; // factor de aplicación del módulo
  diasAdicionales: number;
}
