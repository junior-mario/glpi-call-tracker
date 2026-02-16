import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api, setToken, clearToken } from "@/lib/api";

export interface User {
  id: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Validate existing token on mount
    api.get<{ user: User }>("/api/auth/me")
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { token, user } = await api.post<{ token: string; user: User }>("/api/auth/login", { email, password });
      setToken(token);
      setUser(user);
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Erro ao fazer login" };
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      const { token, user } = await api.post<{ token: string; user: User }>("/api/auth/register", { email, password });
      setToken(token);
      setUser(user);
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Erro ao criar conta" };
    }
  };

  const signOut = async () => {
    clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser usado dentro de um AuthProvider");
  }
  return context;
}
