import { useEffect, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { BiometricAuth, BiometryType } from '@aparajita/capacitor-biometric-auth';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { supabase } from './supabase';

/**
 * useAuth — Supabase auth + iOS biometric layer
 *
 * Stores the refresh token in the iOS Keychain so we can silently restore
 * the session after a Face ID prompt. Email/password never leaves the app.
 */

const KEY_REFRESH = 'firelogbook.refreshToken';
const KEY_EMAIL = 'firelogbook.lastEmail';

export function useAuth() {
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnrolled, setBiometricEnrolled] = useState(false);
  const [biometricType, setBiometricType] = useState<
    'faceId' | 'touchId' | 'fingerprint' | null
  >(null);

  // Probe device capability + whether we have a stored token to unlock
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!Capacitor.isNativePlatform()) return;
      try {
        const info = await BiometricAuth.checkBiometry();
        if (cancelled) return;
        setBiometricAvailable(info.isAvailable);
        setBiometricType(mapBiometryType(info.biometryType));

        if (info.isAvailable) {
          const stored = await SecureStorage.get(KEY_REFRESH).catch(() => null);
          setBiometricEnrolled(Boolean(stored));
        }
      } catch {
        setBiometricAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* --------------------------- sign in --------------------------- */

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await persistForBiometric(data.session?.refresh_token, email);
    return data;
  }, []);

  const signInWithBiometrics = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) {
      throw new Error('Biometric sign-in only available on device.');
    }
    await BiometricAuth.authenticate({
      reason: 'Unlock FireLogbook',
      cancelTitle: 'Use password',
      iosFallbackTitle: 'Use password',
      allowDeviceCredential: false,
    });

    const refreshToken = await SecureStorage.get(KEY_REFRESH).catch(() => null);
    if (!refreshToken) throw new Error('No saved session. Sign in with your password.');

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: String(refreshToken),
    });
    if (error) throw error;

    // Rotate stored refresh token
    if (data.session?.refresh_token) {
      await SecureStorage.set(KEY_REFRESH, data.session.refresh_token, false, false).catch(() => {});
    }
    return data;
  }, []);

  /* --------------------------- password reset --------------------------- */

  const sendPasswordReset = useCallback(async (email: string) => {
    const redirectTo =
      typeof window !== 'undefined'
        ? `${window.location.origin}/auth/reset`
        : 'https://crm.bhofire.com/auth/reset';
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
  }, []);

  /* --------------------------- sign out --------------------------- */

  const signOut = useCallback(async (clearBiometric = false) => {
    await supabase.auth.signOut();
    if (clearBiometric) {
      await SecureStorage.remove(KEY_REFRESH).catch(() => {});
      await SecureStorage.remove(KEY_EMAIL).catch(() => {});
      setBiometricEnrolled(false);
    }
  }, []);

  return {
    signIn,
    signInWithBiometrics,
    sendPasswordReset,
    signOut,
    biometricAvailable,
    biometricEnrolled,
    biometricType,
  };
}

/* ----------------------------- helpers ----------------------------- */

async function persistForBiometric(refreshToken: string | undefined, email: string) {
  if (!Capacitor.isNativePlatform() || !refreshToken) return;
  try {
    // Last two args: sync (iCloud) = false, access (whenUnlocked) = false (defaults are safe)
    await SecureStorage.set(KEY_REFRESH, refreshToken, false, false);
    await SecureStorage.set(KEY_EMAIL, email, false, false);
  } catch {
    /* Keychain unavailable — non-fatal */
  }
}

function mapBiometryType(t: BiometryType): 'faceId' | 'touchId' | 'fingerprint' | null {
  switch (t) {
    case BiometryType.faceId:
      return 'faceId';
    case BiometryType.touchId:
      return 'touchId';
    case BiometryType.fingerprintAuthentication:
      return 'fingerprint';
    default:
      return null;
  }
}
