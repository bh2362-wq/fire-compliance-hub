// Registers /sw.js after window load. Failures are logged but do not surface
// to the user — the app remains functional without offline support.

export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  // Service workers can be flaky in dev with HMR, so opt in via env or build.
  if (import.meta.env.DEV && !import.meta.env.VITE_ENABLE_SW_IN_DEV) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn("Service worker registration failed:", err);
      });
  });
}
