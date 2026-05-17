import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';

/**
 * When running in the native iOS engineer app, force all navigation to /field.
 * Web FireLogbook is unaffected — this only triggers inside the Capacitor shell.
 */
export function ForceFieldRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (location.pathname.startsWith('/field')) return;
    if (location.pathname === '/auth' || location.pathname === '/login') return;
    navigate('/field', { replace: true });
  }, [location.pathname, navigate]);

  return null;
}
