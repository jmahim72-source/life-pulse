/**
 * Auth context — provides current user info and auth actions.
 * Supabase session is persisted automatically by supabase-js.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { clearAllStores } from '../db';
import type { User, Session } from '@supabase/supabase-js';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      // No Supabase configured — run in offline-only mode
      // Create a fake "local" user so the app works
      setLoading(false);
      return;
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    // Clear all IndexedDB stores on sign-out
    await clearAllStores();
    setSession(null);
  }, []);

  const value: AuthContextValue = {
    user: session?.user ?? null,
    session,
    loading,
    signOut: handleSignOut,
  };

  return React.createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  return useContext(AuthContext);
}

/** Get user ID — falls back to 'local' for offline-only mode */
export function useUserId(): string {
  const { user } = useAuth();
  return user?.id ?? 'local';
}
