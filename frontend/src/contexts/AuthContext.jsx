import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, setSessionToken } from "../services/api.js";

const AuthContext = createContext(null);
const storageKey = "repofiscal_token";

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(storageKey));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setSessionToken(null);
      setUser(null);
      setLoading(false);
      return;
    }

    setSessionToken(token);
    api
      .get("/auth/me")
      .then((response) => setUser(response))
      .catch(() => {
        localStorage.removeItem(storageKey);
        setToken(null);
        setSessionToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const value = useMemo(
    () => ({
      token,
      user,
      loading,
      async login(email, password) {
        const response = await api.post("/auth/login", { email, password });
        localStorage.setItem(storageKey, response.token);
        setSessionToken(response.token);
        setToken(response.token);
        setUser(response.user);
        return response.user;
      },
      async logout() {
        try {
          if (token) {
            await api.post("/auth/logout", {});
          }
        } catch {
          // Ignora falhas de logout remoto para garantir limpeza local.
        } finally {
          localStorage.removeItem(storageKey);
          setSessionToken(null);
          setToken(null);
          setUser(null);
        }
      }
    }),
    [loading, token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  }
  return context;
}
