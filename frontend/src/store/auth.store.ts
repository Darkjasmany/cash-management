import { create } from 'zustand';
import { persist } from 'zustand/middleware';


type AuthUser = {
  id: string
  name: string
  email: string
  role: string
}

type AuthStore = {
  user: AuthUser | null
  token: string | null
  setAuth: (user: AuthUser, token: string) => void // función para actualizar el estado de autenticación
  logout: () => void
  isAuthenticated: () => boolean
}

export const useAuthStore = create<AuthStore>()(
  persist( // LocalStorage para mantener la sesión incluso al recargar la página

// set: Se usa para actualizar los datos. Por eso logout hace set({ user: null, token: null }).
// get: Se usa para leer los datos actuales dentro del mismo store.
// isAuthenticated: () => !!get().token: Aquí get().token mira si hay un token, y el !! lo convierte en un valor booleano (true si hay texto, false si es null).

    (set, get) => ({
      user: null,
      token: null,
      setAuth: (user, token) => set({ user, token }),
      logout: () => set({ user: null, token: null }),
      isAuthenticated: () => !!get().token,
    }),
    {
      name: 'futbol-auth', // clave en localStorage
    }
  )
)