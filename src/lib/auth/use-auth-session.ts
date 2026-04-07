"use client";

import { useEffect, useState } from "react";

type SessionPayload = {
  authenticated?: boolean;
  user?: {
    email?: string;
    role?: "operator" | "viewer";
    userId?: string;
  };
};

export function useAuthSession() {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<"operator" | "viewer" | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as SessionPayload;
        return payload;
      })
      .then((payload) => {
        if (cancelled) {
          return;
        }

        if (payload.authenticated && payload.user?.role) {
          setAuthenticated(true);
          setEmail(payload.user.email ?? null);
          setRole(payload.user.role);
          setLoading(false);
          return;
        }

        setAuthenticated(false);
        setEmail(null);
        setRole(null);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setAuthenticated(false);
        setEmail(null);
        setRole(null);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    loading,
    authenticated,
    email,
    role,
    isOperator: role === "operator",
    isViewer: role === "viewer",
  };
}
