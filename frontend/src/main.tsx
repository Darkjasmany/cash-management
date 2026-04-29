import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ToastContainer } from "react-toastify";
import "./index.css";
import Router from "./router";

/**
 QueryClient como un Manager de Cache y Repositorio de Datos.
 Es el motor que gestiona todas tus peticiones HTTP al backend de fútbol. Sus funciones principales son:

Cache Inteligente: Si entras a ver el "Perfil de Usuario", lo descarga. Si sales y vuelves a entrar a los 10 segundos, no vuelve a llamar al servidor; te da lo que tiene guardado en memoria.

Estado de la petición: Te dice automáticamente si la petición está cargando (isLoading), si falló (isError) o si ya tiene datos (data).
*/
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1, // Si una petición falla (por un microcorte de internet), React Query lo intentará una vez más automáticamente antes de mostrar un error.
      staleTime: 1000 * 60 * 5, // 5 minutos. Durante este tiempo, los datos se consideran "frescos" y no se volverán a pedir al servidor si vuelves a la misma página.
    },
  },
});

/**
 * QueryClientProvider: Es el "Contexto". Envuelve a toda tu app para que cualquier componente (un botón, una tabla de posiciones) pueda usar la cache.
 * ToastContainer: Es el gestor de notificaciones. Cuando registres un usuario o haya un error, aparecerá un globito (pop-up) elegante. Configuraste que no se pause al pasar el mouse, para que sea más dinámico.
 * ReactQueryDevtools: panel en el navegador donde puedes ver exactamente qué datos hay en la cache, qué peticiones están fallando y cuánto tiempo les queda de vida.
 */
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* <App /> */}
      <Router />
      <ToastContainer pauseOnHover={false} pauseOnFocusLoss={false} />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </StrictMode>
);
