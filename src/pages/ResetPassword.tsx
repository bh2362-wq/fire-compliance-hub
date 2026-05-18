import { useState, useEffect, FormEvent, forwardRef, ReactNode, InputHTMLAttributes } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, Lock, Mail, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

/**
 * Reset Password — handles BOTH stages of the Supabase recovery flow:
 *
 *   Stage 1 (request):   user enters email → reset link sent.
 *   Stage 2 (recover):   user arrives via the email link → sets new password.
 *
 * Mounted at /auth/reset (and aliased at /reset-password).
 */

type Mode = 'detecting' | 'request' | 'recover' | 'done';

export default function ResetPassword() {
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('detecting');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  /* ---------- detect which stage we're in ---------- */
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setMode('recover');
    });

    const url = window.location.hash + window.location.search;
    const hasRecoveryToken =
      url.includes('type=recovery') || url.includes('access_token=');

    if (hasRecoveryToken) {
      setMode('recover');
      return () => sub.subscription.unsubscribe();
    }

    const t = setTimeout(() => {
      setMode((m) => (m === 'detecting' ? 'request' : m));
    }, 250);
    return () => {
      clearTimeout(t);
      sub.subscription.unsubscribe();
    };
  }, []);

  /* ---------- stage 1: send reset email ---------- */
  async function handleRequest(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!email.trim()) {
      setError('Please enter your email.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: `${window.location.origin}/auth/reset` },
      );
      if (error) throw error;
      setSuccess('Check your inbox. The link will let you set a new password.');
    } catch (err: any) {
      setError(err?.message || 'Could not send reset email.');
    } finally {
      setLoading(false);
    }
  }

  /* ---------- stage 2: set new password ---------- */
  async function handleNewPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMode('done');
      setSuccess('Password updated. Redirecting…');
      setTimeout(() => navigate('/dashboard', { replace: true }), 1500);
    } catch (err: any) {
      const msg = String(err?.message || '').toLowerCase();
      if (msg.includes('expired') || msg.includes('invalid') || msg.includes('token')) {
        setError('This reset link has expired. Request a new one below.');
        setMode('request');
      } else if (msg.includes('same')) {
        setError('New password must be different from your current one.');
      } else {
        setError(err?.message || 'Could not update password.');
      }
    } finally {
      setLoading(false);
    }
  }

  if (mode === 'detecting') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-neutral-950 text-white overflow-hidden flex items-center justify-center px-6 py-10">
      {/* Ambient fire-glow */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-24 w-[28rem] h-[28rem] rounded-full bg-orange-600/20 blur-3xl" />
        <div className="absolute -bottom-32 -right-24 w-[28rem] h-[28rem] rounded-full bg-red-700/20 blur-3xl" />
      </div>

      <div className="w-full max-w-sm flex flex-col gap-6">
        {/* Hero */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-900/40">
            <Flame className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {mode === 'request' && 'Reset password'}
            {mode === 'recover' && 'Set new password'}
            {mode === 'done' && 'All done'}
          </h1>
          <p className="text-sm text-neutral-400 max-w-xs">
            {mode === 'request' && 'Enter your email and we will send you a reset link.'}
            {mode === 'recover' && 'Choose a new password for your FireLogbook account.'}
            {mode === 'done' && 'Your password has been updated.'}
          </p>
        </div>

        {/* Stage 1 form */}
        {mode === 'request' && (
          <form onSubmit={handleRequest} className="flex flex-col gap-3">
            <Field
              icon={<Mail className="w-4 h-4" />}
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

            {error && <ErrorBox>{error}</ErrorBox>}
            {success && <SuccessBox>{success}</SuccessBox>}

            <PrimaryButton loading={loading}>
              {loading ? 'Sending…' : 'Send reset link'}
            </PrimaryButton>

            <button
              type="button"
              onClick={() => navigate('/auth')}
              className="text-center text-sm text-neutral-400 hover:text-neutral-200 py-2 mt-1"
            >
              Back to sign in
            </button>
          </form>
        )}

        {/* Stage 2 form */}
        {mode === 'recover' && (
          <form onSubmit={handleNewPassword} className="flex flex-col gap-3">
            <Field
              icon={<Lock className="w-4 h-4" />}
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="New password"
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
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
            />
            <Field
              icon={<Lock className="w-4 h-4" />}
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={setConfirm}
              disabled={loading}
            />

            <p className="text-xs text-neutral-500 px-1">At least 8 characters.</p>

            {error && <ErrorBox>{error}</ErrorBox>}
            {success && <SuccessBox>{success}</SuccessBox>}

            <PrimaryButton loading={loading}>
              {loading ? 'Updating…' : 'Update password'}
            </PrimaryButton>
          </form>
        )}

        {/* Done state */}
        {mode === 'done' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-green-400" />
            </div>
            <p className="text-sm text-neutral-400">Redirecting to your dashboard…</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   Inline UI helpers — same look as LoginScreen
   ============================================================ */

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
    <label className="flex items-center gap-3 px-4 h-12 rounded-xl bg-neutral-900/80 border border-neutral-800 focus-within:border-orange-500/60 transition-colors">
      <span className="text-neutral-500">{icon}</span>
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

function PrimaryButton({
  loading,
  children,
}: {
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 text-white font-medium shadow-lg shadow-orange-900/30 active:scale-[0.99] disabled:opacity-60 disabled:active:scale-100 flex items-center justify-center gap-2"
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
}

function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function SuccessBox({ children }: { children: ReactNode }) {
  return (
    <div className="text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
      {children}
    </div>
  );
}
