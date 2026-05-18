import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, Loader2, Shield, BookOpen, ClipboardCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import LoginForm from '@/components/auth/LoginForm';
import SignupForm from '@/components/auth/SignupForm';
import ForgotPasswordForm from '@/components/auth/ForgotPasswordForm';
import MFAEnroll from '@/components/auth/MFAEnroll';
import MFAVerify from '@/components/auth/MFAVerify';

type AuthView = 'login' | 'signup' | 'forgot-password' | 'mfa-enroll' | 'mfa-verify';

export default function Auth() {
  const [view, setView] = useState<AuthView>('login');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user, loading, signIn, signUp, signOut, resetPassword } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!loading && user) {
      checkMFAStatus();
    }
  }, [user, loading]);

  const checkMFAStatus = async () => {
    const { data: factorsData } = await supabase.auth.mfa.listFactors();
    const totpFactors = factorsData?.totp ?? [];
    const verifiedFactors = totpFactors.filter(f => f.status === 'verified');

    if (verifiedFactors.length > 0) {
      // Has MFA enrolled - check current AAL
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalData?.currentLevel === 'aal1') {
        setView('mfa-verify');
        return;
      }
      navigate('/dashboard');
    } else {
      // No MFA - offer enrollment
      setView('mfa-enroll');
    }
  };

  const handleLogin = async (email: string, password: string) => {
    setIsSubmitting(true);
    const { error } = await signIn(email, password);
    setIsSubmitting(false);

    if (error) {
      toast({
        variant: 'destructive',
        title: 'Login failed',
        description: error.message === 'Invalid login credentials'
          ? 'Invalid email or password. Please try again.'
          : error.message,
      });
    }
    // MFA check happens via useEffect when user state updates
  };

  const handleSignup = async (email: string, password: string, fullName: string) => {
    setIsSubmitting(true);
    const { error } = await signUp(email, password, fullName);
    setIsSubmitting(false);

    if (error) {
      toast({
        variant: 'destructive',
        title: 'Signup failed',
        description: error.message.includes('already registered')
          ? 'This email is already registered. Please login instead.'
          : error.message,
      });
    } else {
      toast({ title: 'Account created!', description: 'You can now access the dashboard.' });
    }
  };

  const handleForgotPassword = async (email: string) => {
    setIsSubmitting(true);
    const { error } = await resetPassword(email);
    setIsSubmitting(false);

    if (error) {
      toast({ variant: 'destructive', title: 'Reset failed', description: error.message });
    }
  };

  const handleMFAComplete = () => {
    navigate('/dashboard');
  };

  const handleMFASkip = () => {
    navigate('/dashboard');
  };

  const handleMFACancel = async () => {
    await signOut();
    setView('login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-hero">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex gradient-hero">
      {/* Left branding panel - hidden on mobile */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden">
        {/* Decorative fire glow */}
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-accent/10 blur-3xl" />
        <div className="absolute top-1/4 right-0 w-64 h-64 rounded-full bg-accent/5 blur-3xl" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-11 h-11 rounded-xl gradient-accent flex items-center justify-center shadow-glow">
              <Flame className="w-6 h-6 text-accent-foreground" />
            </div>
            <span className="text-2xl font-bold text-primary-foreground">Fire Log Book</span>
          </div>
          <p className="text-primary-foreground/50 text-sm mt-1">Internal Management System</p>
        </div>

        <div className="relative z-10 space-y-8">
          <div className="space-y-6">
            {[
              { icon: ClipboardCheck, title: 'Compliance Tracking', desc: 'Automated fire alarm service schedules and BS 5839 compliance' },
              { icon: BookOpen, title: 'Digital Log Books', desc: 'Complete digital records for all sites and service visits' },
              { icon: Shield, title: 'Secure & Auditable', desc: 'Two-factor authentication with full audit trails' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary-foreground/5 border border-primary-foreground/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-primary-foreground">{title}</h3>
                  <p className="text-xs text-primary-foreground/50 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10">
          <p className="text-xs text-primary-foreground/30">
            © {new Date().getFullYear()} BHO Fire. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        {/* Mobile logo */}
        <div className="lg:hidden absolute top-6 left-6 flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg gradient-accent flex items-center justify-center">
            <Flame className="w-5 h-5 text-accent-foreground" />
          </div>
          <span className="text-lg font-bold text-primary-foreground">Fire Log Book</span>
        </div>

        <Card className="w-full max-w-md border-border/50 shadow-xl">
          <CardContent className="p-8">
            {view === 'login' && (
              <LoginForm
                onSubmit={handleLogin}
                onForgotPassword={() => setView('forgot-password')}
                onSwitchToSignup={() => setView('signup')}
                isSubmitting={isSubmitting}
              />
            )}
            {view === 'signup' && (
              <SignupForm
                onSubmit={handleSignup}
                onSwitchToLogin={() => setView('login')}
                isSubmitting={isSubmitting}
              />
            )}
            {view === 'forgot-password' && (
              <ForgotPasswordForm
                onSubmit={handleForgotPassword}
                onBack={() => setView('login')}
                isSubmitting={isSubmitting}
              />
            )}
            {view === 'mfa-enroll' && (
              <MFAEnroll onComplete={handleMFAComplete} onSkip={handleMFASkip} />
            )}
            {view === 'mfa-verify' && (
              <MFAVerify onComplete={handleMFAComplete} onCancel={handleMFACancel} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
