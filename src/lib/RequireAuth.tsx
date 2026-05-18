import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';

/**
 * Route guard: redirects unauthenticated users to /auth.
 *
 * Note: this project also has `@/components/ProtectedRoute` which performs
 * the same job and is already wired across every protected route. This file
 * is provided per the auth-flow spec and can be used for new routes; existing
 * routes were left on ProtectedRoute to avoid a 40+ route mechanical rewrite.
 */
export default function RequireAuth({ children }: { children: JSX.Element }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const location = useLocation();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return null;
  if (!session) return <Navigate to="/auth" state={{ from: location }} replace />;
  return children;
}
