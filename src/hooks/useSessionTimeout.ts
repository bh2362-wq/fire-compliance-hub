import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

const TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const WARNING_MS = 2 * 60 * 1000; // Show warning 2 minutes before

export function useSessionTimeout() {
  const { user, signOut } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const warningRef = useRef<ReturnType<typeof setTimeout>>();
  const countdownRef = useRef<ReturnType<typeof setInterval>>();

  const resetTimers = useCallback(() => {
    if (!user) return;
    
    clearTimeout(timeoutRef.current);
    clearTimeout(warningRef.current);
    clearInterval(countdownRef.current);
    setShowWarning(false);

    warningRef.current = setTimeout(() => {
      setShowWarning(true);
      setRemainingSeconds(Math.floor(WARNING_MS / 1000));
      countdownRef.current = setInterval(() => {
        setRemainingSeconds(prev => {
          if (prev <= 1) {
            clearInterval(countdownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, TIMEOUT_MS - WARNING_MS);

    timeoutRef.current = setTimeout(() => {
      signOut();
    }, TIMEOUT_MS);
  }, [user, signOut]);

  const extendSession = useCallback(() => {
    resetTimers();
  }, [resetTimers]);

  useEffect(() => {
    if (!user) return;

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    const handleActivity = () => {
      if (!showWarning) resetTimers();
    };

    events.forEach(e => window.addEventListener(e, handleActivity, { passive: true }));
    resetTimers();

    return () => {
      events.forEach(e => window.removeEventListener(e, handleActivity));
      clearTimeout(timeoutRef.current);
      clearTimeout(warningRef.current);
      clearInterval(countdownRef.current);
    };
  }, [user, resetTimers, showWarning]);

  return { showWarning, remainingSeconds, extendSession };
}
