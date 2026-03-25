import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const [mfaChecked, setMfaChecked] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);

  useEffect(() => {
    if (user) {
      checkMFA();
    } else {
      setMfaChecked(true);
    }
  }, [user]);

  const checkMFA = async () => {
    const { data: factorsData } = await supabase.auth.mfa.listFactors();
    const verifiedFactors = (factorsData?.totp ?? []).filter(f => f.status === 'verified');

    if (verifiedFactors.length > 0) {
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalData?.currentLevel === 'aal1') {
        setMfaRequired(true);
        setMfaChecked(true);
        return;
      }
    }
    setMfaRequired(false);
    setMfaChecked(true);
  };

  if (loading || !mfaChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || mfaRequired) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}
