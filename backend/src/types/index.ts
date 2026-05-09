// ─── Fila que devuelve GET_DEUDAS_SIIM_SQL ───────────────────
// UNA fila por factura (el query ordena por fecha ASC)
export interface FilaSiim {
  id_factura: number;
  id_modulo: number;
  fecha_creacion: Date; // f."fechaCreacion" real
  id_cliente: number;
  cedula: string;
  // tipo_id: string; // 'C' | 'R' | 'P'
  nombre_cliente: string;
  // Montos calculados en el SQL con SUM+CASE
  total_nominal: number; // todos los rubros activos sin intereses
  servicio_administrativo: number; // rubros tipo 2 o id específico por módulo
  bomberos: number; // solo catastro urbano/rural
  base_predial_pura: number; // impuesto predial + exoneración (base pronto pago)
  // Referencia bancaria
  contrapartida: string; // clave catastral o referencia de agua
  referencia: string; // descripción legible para referencia (ej. "Catastro urbano. Años: 2019, 2020")
}

// ─── Registro consolidado listo para guardar / exportar ──────
// export interface RegistroDeuda {
//   tipo: string; // "CO"
//   contrapartida: string; // clave catastral o referencia de agua
//   moneda: string; // "USD"
//   valor: number; // centavos enteros (123.90 → 12390)
//   formaCobro: string; // "REC"
//   ref1: string; // EN BLANCO
//   ref2: string; // EN BLANCO
//   referencia: string; // texto legible para el banco
//   tipoId: string; // C | R | P
//   numeroId: string; // número de cédula/ruc/pasaporte
//   nombreCliente: string;
//   idCliente: string;
//   totalDecimal: number; // para Excel legible, valor en USD con decimales (ej: 123.90)
// }

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

  // Nuevos campos para desglose (opcionales, pero los usas en createMany)
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

export interface RubroSiim {
  id: number;
  calculable: number; // 1 = porcentaje, 0 = valor fijo
  valor: number; // porcentaje o valor fijo
  descripcion: string;
}
