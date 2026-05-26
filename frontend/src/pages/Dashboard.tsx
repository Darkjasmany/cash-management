import { CONFIG_MODULOS } from "@/data/modules";
import { useCuttings, useDashboardStats } from "@/features/cut/hooks/useCut";
import { Activity, ArrowRight, Calendar, DollarSign, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: cuts = [], isLoading: cutsLoading } = useCuttings();
  const { data: stats = [], isLoading: statsLoading } = useDashboardStats();

  // Conseguir el corte activo actual para mostrar métricas reales en el Dashboard
  const activeCut = cuts.find(c => c.estado === "ACTIVO") || cuts[0];

  const categoriasData = stats.map(stat => ({
    name: stat.modulo,
    value: stat.totalDeuda,
    color: CONFIG_MODULOS[stat.id_modulo]?.color || "#64748b",
  }));

  // Si las peticiones de cortes o estadísticas están cargando, mostrar un estado de carga centralizado
  if (statsLoading || cutsLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-24 min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500 mb-3"></div>
        <p className="text-slate-400 text-sm font-medium">Sincronizando métricas con el SIIM...</p>
      </div>
    );
  }

  return (
    <div className="max-w-8xl mx-auto p-4 animate-in fade-in duration-500">
      {/* Encabezado */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white tracking-tight">Resumen Operativo</h1>
        <p className="text-slate-400 text-sm mt-1">
          Estado actual de la recaudación y archivos de corte para Banco de Pichincha
        </p>
      </div>

      {/* FILA DE TARGETAS METRICAS (KPIs) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        {/* Tarjeta 1: Total Deuda */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Monto en Cartera
            </span>
            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <h2 className="text-2xl font-mono font-bold text-white">
            {activeCut?.totalDeuda
              ? `$${Number(activeCut.totalDeuda).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
              : "$0.00"}
          </h2>
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
            Corte activo actual
          </p>
        </div>

        {/* Tarjeta 2: Total Registros */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Clientes con Deuda
            </span>
            <div className="p-2 bg-sky-500/10 rounded-lg text-sky-400">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <h2 className="text-2xl font-mono font-bold text-white">
            {activeCut?.totalRegistros ? Number(activeCut.totalRegistros).toLocaleString() : "0"}
          </h2>
          <p className="text-xs text-slate-500 mt-1">Obligaciones recaudables del SIIM</p>
        </div>

        {/* Tarjeta 3: Fecha del Último Proceso */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Último Proceso
            </span>
            <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400">
              <Calendar className="h-4 w-4" />
            </div>
          </div>
          <h2 className="text-2xl font-mono font-bold text-slate-200">
            {activeCut?.fechaCorte || "Sin registros"}
          </h2>
          <p className="text-xs text-slate-500 mt-1">Fecha de la última sincronización</p>
        </div>
      </div>

      {/* SECCIÓN INFERIOR: GRÁFICO DE PASTEL Y ACCIONES */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* GRÁFICO DE PASTEL (Ocupa 2 columnas en pantallas grandes) */}
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 lg:col-span-2 flex flex-col justify-between shadow-xl">
          <div>
            <h3 className="text-sm font-semibold text-white tracking-tight flex items-center gap-2">
              <Activity className="h-4 w-4 text-sky-500" />
              Distribución de Registros por Tipo de Servicio
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Desglose porcentual del universo cargado en el corte activo
            </p>
          </div>

          <div className="h-56 w-full mt-4 flex items-center justify-center">
            {categoriasData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoriasData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {categoriasData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      borderColor: "#1e293b",
                      borderRadius: "8px",
                    }}
                    itemStyle={{ color: "#f8fafc", fontSize: "12px" }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    iconType="circle"
                    wrapperStyle={{ fontSize: "11px", color: "#94a3b8" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-slate-600">No hay información gráfica disponible</p>
            )}
          </div>
        </div>

        {/* COLUMNA DE ACCIÓN RÁPIDA (Ocupa 1 columna) */}
        <div className="flex flex-col gap-4">
          <div className=" bg-linear-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl p-6 flex flex-col justify-between h-full shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 text-slate-800/20 text-7xl font-bold select-none pointer-events-none font-mono">
              $
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Módulo de Operaciones</h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Genera un nuevo archivo consolidado interactuando directamente con las bases de
                datos vigentes del SIIM.
              </p>
            </div>

            <button
              onClick={() => navigate("/process")}
              className="mt-6 w-full h-11 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer shadow-lg shadow-sky-600/10"
            >
              Procesar Nuevo Corte
              <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
