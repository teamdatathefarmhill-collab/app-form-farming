import { useState, useEffect } from "react";

const STORAGE_KEY = "farmhill_user";

export function useAuth() {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const login = (userData, remember = false) => {
    setUser(userData);
    if (remember) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
    } else {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
  };

  // Cek sessionStorage juga saat mount
  useEffect(() => {
    if (!user) {
      try {
        const session = sessionStorage.getItem(STORAGE_KEY);
        if (session) setUser(JSON.parse(session));
      } catch {}
    }
  }, []);

  return { user, login, logout, isLoggedIn: !!user };
}
