"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { User } from "@/lib/contracts";
import {
  clearSessionToken,
  getSessionToken,
  setSessionToken,
  subscribeSession,
} from "@/lib/auth-token";

export type AuthStatus = "loading" | "signed-in" | "signed-out";
interface AuthValue {
  user: User | null;
  status: AuthStatus;
  signIn: (input: { email: string; password: string }) => Promise<User>;
  signUp: (input: {
    name: string;
    email: string;
    password: string;
  }) => Promise<User>;
  signOut: () => Promise<void>;
}
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const cache = useQueryClient();

  useEffect(() => {
    let live = true;
    void (async () => {
      await Promise.resolve();
      if (!getSessionToken()) {
        if (live) setStatus("signed-out");
        return;
      }
      try {
        const me = await api.me();
        if (live) {
          setUser(me.user);
          setStatus("signed-in");
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 401)
          clearSessionToken();
        if (live) {
          setUser(null);
          setStatus("signed-out");
        }
      }
    })();
    // A 401 anywhere in the app clears the token; reflect that here.
    const unsubscribe = subscribeSession(() => {
      if (!getSessionToken()) {
        setUser(null);
        setStatus("signed-out");
      }
    });
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);

  const start = useCallback((session: { user: User; token: string }) => {
    setSessionToken(session.token);
    setUser(session.user);
    setStatus("signed-in");
    return session.user;
  }, []);
  const signIn = useCallback(
    async (input: { email: string; password: string }) =>
      start(await api.login(input)),
    [start],
  );
  const signUp = useCallback(
    async (input: { name: string; email: string; password: string }) =>
      start(await api.register(input)),
    [start],
  );
  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* The local session is cleared regardless. */
    }
    clearSessionToken();
    setUser(null);
    setStatus("signed-out");
    cache.clear();
  }, [cache]);

  const value = useMemo(
    () => ({ user, status, signIn, signUp, signOut }),
    [user, status, signIn, signUp, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
