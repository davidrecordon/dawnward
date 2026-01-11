import { useSyncExternalStore, useCallback } from "react";

/** Tailwind md breakpoint (768px) for desktop detection */
export const MD_BREAKPOINT = 768;
export const MD_BREAKPOINT_QUERY = `(min-width: ${MD_BREAKPOINT}px)`;

/**
 * Hook to detect if a CSS media query matches.
 * Used for responsive component rendering (e.g., Dialog on desktop, Drawer on mobile).
 *
 * Uses useSyncExternalStore for proper React 18+ external state subscription.
 *
 * @param query - CSS media query string (e.g., "(min-width: 768px)")
 * @returns boolean indicating if the query matches
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (callback: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", callback);
      return () => media.removeEventListener("change", callback);
    },
    [query]
  );

  const getSnapshot = useCallback(() => {
    return window.matchMedia(query).matches;
  }, [query]);

  const getServerSnapshot = useCallback(() => {
    // Default to false during SSR (mobile-first)
    return false;
  }, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
