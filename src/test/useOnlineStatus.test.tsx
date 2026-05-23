import { describe, it, expect, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

// useOnlineStatus is the trigger the sync worker subscribes to. Getting the
// state wrong on either side stalls the offline queue, so the behaviours
// that matter are pinned here: initial state mirrors navigator.onLine, the
// window "online" event flips the hook true, and "offline" flips it false.
//
// Hand-rolled renderHook — @testing-library/react can't load in this
// project (its dom peer dep isn't installed), but React's own act +
// createRoot are enough to drive a hook.

function renderHook<T>(hookFn: () => T) {
  const result = { current: undefined as T | undefined };
  function Host() {
    result.current = hookFn();
    return null;
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(<Host />);
  });
  return {
    result,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value,
  });
}

afterEach(() => {
  setNavigatorOnline(true);
});

describe("useOnlineStatus", () => {
  it("starts true when navigator.onLine is true", () => {
    setNavigatorOnline(true);
    const { result, unmount } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
    unmount();
  });

  it("starts false when navigator.onLine is false", () => {
    setNavigatorOnline(false);
    const { result, unmount } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);
    unmount();
  });

  it("flips to true on the window online event", () => {
    setNavigatorOnline(false);
    const { result, unmount } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);

    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current).toBe(true);
    unmount();
  });

  it("flips to false on the window offline event", () => {
    setNavigatorOnline(true);
    const { result, unmount } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current).toBe(false);
    unmount();
  });

  it("detaches listeners on unmount — events after unmount don't throw", () => {
    setNavigatorOnline(true);
    const { unmount } = renderHook(() => useOnlineStatus());
    unmount();
    expect(() => {
      window.dispatchEvent(new Event("offline"));
      window.dispatchEvent(new Event("online"));
    }).not.toThrow();
  });
});
