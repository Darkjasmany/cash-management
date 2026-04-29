import { useAuthStore } from "@/store/auth.store";
import { useNavigate } from "react-router-dom";

type DashboardCard = {
  title: string;
  description: string;
  icon: string;
  path: string;
  color: string;
};

const cards: DashboardCard[] = [
  {
    title: "Jugadores",
    description: "Registra jugadores, asígnalos a equipos y gestiona sus fichas de inscripción.",
    icon: "👥",
    path: "/players",
    color: "hover:border-sky-500",
  },
  {
    title: "Partidos",
    description:
      "Crea partidos, valida jugadores con reconocimiento facial y registra incidencias.",
    icon: "⚽",
    path: "/matches",
    color: "hover:border-green-500",
  },
];

export default function Dashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Bienvenido, {user?.name} 👋</h1>
        <p className="text-slate-400 mt-1">Sistema de registro y validación de jugadores</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
        {cards.map(card => (
          <button
            key={card.path}
            onClick={() => navigate(card.path)}
            className={`
              bg-slate-900 border border-slate-800 rounded-xl p-6 text-left
              transition-all duration-200 hover:scale-[1.02] ${card.color}
              cursor-pointer group
            `}
          >
            <div className="text-4xl mb-4">{card.icon}</div>
            <h2 className="text-lg font-medium text-white mb-2 group-hover:text-sky-400 transition-colors">
              {card.title}
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed">{card.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
