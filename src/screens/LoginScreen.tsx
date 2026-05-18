import { useState, useEffect, useRef, FormEvent } from 'react';
import { Flame, Mail, Lock, Eye, EyeOff, Fingerprint, Loader2, AlertCircle } from 'lucide-react';
import { Keyboard } from '@capacitor/keyboard';
import { Capacitor } from '@capacitor/core';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';

/**
 * FireLogbook Login Screen
 * --------------------------------
 * - Email / password via Supabase
 * - Face ID / Touch ID for returning users (iOS Keychain)
 * - Forgot password (deep link)
 * - Keyboard-aware, safe-area aware
 * - BHO Fire orange branding
 */
export default function LoginScreen() {
  const {
    signIn,
    signInWithBiometrics,
    sendPasswordReset,
    biometricAvailable,
    biometricEnrolled,
    biometricType, // 'faceId' | 'touchId' | 'fingerprint' | null
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect signed-in users away from /auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        const from = (location.state as any)?.from?.pathname || '/dashboard';
        navigate(from, { replace: true });
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        const from = (location.state as any)?.from?.pathname || '/dashboard';
        navigate(from, { replace: true });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate, location]);

  // Auto-prompt biometric on mount if the user has previously enabled it
  useEffect(() => {
    if (biometricEnrolled && biometricAvailable) {
      handleBiometricLogin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biometricEnrolled, biometricAvailable]);

  // Keyboard show/hide → shrink hero so form stays in view
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const show = Keyboard.addListener('keyboardWillShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardWillHide', () => setKeyboardOpen(false));
    return () => {
      show.then((h) => h.remove());
      hide.then((h) => h.remove());
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
      // Navigation handled by auth state listener at app root
    } catch (err: any) {
      setError(mapAuthError(err));
      // Haptic on error if available
      if (Capacitor.isNativePlatform()) {
        const { Haptics, NotificationType } = await import('@capacitor/haptics');
        Haptics.notification({ type: NotificationType.Error }).catch(() => {});
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleBiometricLogin() {
    setError(null);
    setBiometricLoading(true);
    try {
      await signInWithBiometrics();
    } catch (err: any) {
      // User cancelled — silent. Anything else — show.
      if (!String(err?.message || '').match(/cancel|userFallback/i)) {
        setError(mapAuthError(err));
      }
    } finally {
      setBiometricLoading(false);
    }
  }

  async function handleForgotPassword() {
    setError(null);
    if (!email.trim()) {
      setError('Enter your email above first, then tap Forgot password.');
      emailRef.current?.focus();
      return;
    }
    try {
      await sendPasswordReset(email.trim().toLowerCase());
      setResetSent(true);
      setTimeout(() => setResetSent(false), 6000);
    } catch (err: any) {
      setError(mapAuthError(err));
    }
  }

  const biometricLabel =
    biometricType === 'faceId' ? 'Sign in with Face ID' :
    biometricType === 'touchId' ? 'Sign in with Touch ID' :
    'Sign in with biometrics';

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col">
      {/* Ambient fire-glow background */}
      <div
        aria-hidden
        className="absolute inset-0 overflow-hidden pointer-events-none"
      >
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-orange-600/20 blur-3xl" />
        <div className="absolute top-1/3 -right-32 h-80 w-80 rounded-full bg-orange-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(251,146,60,0.08),transparent_60%)]" />
      </div>

      {/* Safe area top */}
      <div style={{ paddingTop: 'env(safe-area-inset-top)' }} />

      <div className="relative flex-1 flex flex-col px-6">
        {/* Hero */}
        <div
          className={`flex flex-col items-center transition-all duration-300 ${
            keyboardOpen ? 'pt-6 pb-4' : 'pt-16 pb-10'
          }`}
        >
          <div
            className={`relative grid place-items-center rounded-2xl bg-gradient-to-br from-orange-500 to-orange-700 shadow-lg shadow-orange-900/40 transition-all duration-300 ${
              keyboardOpen ? 'h-12 w-12' : 'h-16 w-16'
            }`}
          >
            <Flame className={`text-white ${keyboardOpen ? 'h-6 w-6' : 'h-8 w-8'}`} strokeWidth={2.2} />
            <span className="absolute inset-0 rounded-2xl ring-1 ring-white/10" />
          </div>
          {!keyboardOpen && (
            <>
              <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white">
                FireLogbook
              </h1>
              <p className="mt-1 text-sm text-neutral-400">
                BHO Fire & Security — sign in to continue
              </p>
            </>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Field
            ref={emailRef}
            icon={<Mail className="h-4 w-4" />}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="Email"
            value={email}
            onChange={setEmail}
            disabled={loading}
          />

          <Field
            icon={<Lock className="h-4 w-4" />}
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={setPassword}
            disabled={loading}
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="text-neutral-500 hover:text-neutral-300 p-1 -mr-1"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />

          {/* Forgot password */}
          <div className="flex justify-end -mt-1">
            <button
              type="button"
              onClick={handleForgotPassword}
              className="text-xs font-medium text-orange-400 hover:text-orange-300 active:text-orange-500 py-1.5 px-1"
            >
              Forgot password?
            </button>
          </div>

          {/* Status messages */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-950/40 border border-red-900/60 px-3 py-2.5 text-sm text-red-200">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}
          {resetSent && !error && (
            <div className="rounded-lg bg-orange-950/40 border border-orange-900/60 px-3 py-2.5 text-sm text-orange-200">
              Password reset link sent. Check your email.
            </div>
          )}

          {/* Primary CTA */}
          <button
            type="submit"
            disabled={loading || biometricLoading}
            className="mt-2 h-12 rounded-xl bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white font-semibold tracking-tight shadow-lg shadow-orange-900/30 disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in…
              </>
            ) : (
              'Sign In'
            )}
          </button>

          {/* Biometric secondary */}
          {biometricAvailable && biometricEnrolled && (
            <button
              type="button"
              onClick={handleBiometricLogin}
              disabled={loading || biometricLoading}
              className="h-12 rounded-xl border border-neutral-800 bg-neutral-900/60 hover:bg-neutral-800/60 active:bg-neutral-900 text-neutral-100 font-medium flex items-center justify-center gap-2 disabled:opacity-60 transition-colors"
            >
              {biometricLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Fingerprint className="h-4 w-4 text-orange-400" />
              )}
              {biometricLabel}
            </button>
          )}
        </form>

        <div className="flex-1" />

        {/* Footer */}
        <div className="pb-4 text-center">
          <p className="text-xs text-neutral-500">
            New engineer? Contact your administrator for access.
          </p>
        </div>
      </div>

      {/* Safe area bottom */}
      <div style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} />
    </div>
  );
}

/* ----------------------------------------------------------- */
/* Field                                                       */
/* ----------------------------------------------------------- */

import { forwardRef, ReactNode, InputHTMLAttributes } from 'react';

type FieldProps = {
  icon: ReactNode;
  trailing?: ReactNode;
  value: string;
  onChange: (v: string) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'>;

const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { icon, trailing, value, onChange, className = '', ...rest },
  ref,
) {
  return (
    <label className="group flex items-center gap-3 h-12 px-3.5 rounded-xl bg-neutral-900/70 border border-neutral-800 focus-within:border-orange-500/70 focus-within:bg-neutral-900 transition-colors">
      <span className="text-neutral-500 group-focus-within:text-orange-400 transition-colors">
        {icon}
      </span>
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`flex-1 bg-transparent outline-none text-[16px] text-white placeholder:text-neutral-500 ${className}`}
        {...rest}
      />
      {trailing}
    </label>
  );
});

/* ----------------------------------------------------------- */
/* Error mapping                                               */
/* ----------------------------------------------------------- */

function mapAuthError(err: any): string {
  const msg = String(err?.message || err || '').toLowerCase();
  if (msg.includes('invalid login') || msg.includes('invalid credentials')) {
    return 'Incorrect email or password.';
  }
  if (msg.includes('email not confirmed')) {
    return 'Please confirm your email before signing in.';
  }
  if (msg.includes('network') || msg.includes('failed to fetch')) {
    return 'No internet connection. Check your signal and try again.';
  }
  if (msg.includes('rate') || msg.includes('too many')) {
    return 'Too many attempts. Wait a moment and try again.';
  }
  if (msg.includes('biometric') && msg.includes('not')) {
    return 'Biometric sign-in unavailable. Use your password.';
  }
  return err?.message || 'Something went wrong. Please try again.';
}
