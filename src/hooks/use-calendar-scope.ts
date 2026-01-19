"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

/**
 * Hook to get verified calendar scope status.
 *
 * The session's hasCalendarScope can become stale if:
 * - User revoked access in Google settings
 * - Token was refreshed without calendar scope
 * - Stored scope doesn't match actual token
 *
 * This hook verifies the actual scope with Google's tokeninfo endpoint.
 */
export function useCalendarScope() {
  const { data: session, status } = useSession();
  const isLoggedIn = status === "authenticated";
  const sessionHasScope = session?.hasCalendarScope ?? false;

  // Verified state: null = not yet verified, boolean = verified result
  const [verifiedScope, setVerifiedScope] = useState<boolean | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Reset verified state when session changes
  useEffect(() => {
    setVerifiedScope(null);
  }, [session?.user?.id]);

  // Verify scope when session says we have it
  useEffect(() => {
    // Don't verify if not logged in or session says no scope
    if (!isLoggedIn || !sessionHasScope) {
      setVerifiedScope(null);
      return;
    }

    // Already verified or currently verifying
    if (verifiedScope !== null || isVerifying) {
      return;
    }

    const verify = async () => {
      setIsVerifying(true);
      try {
        const response = await fetch("/api/calendar/verify");
        if (response.ok) {
          const data = await response.json();
          setVerifiedScope(data.hasCalendarScope);

          if (data.mismatch) {
            console.warn(
              "[useCalendarScope] Mismatch detected:",
              `session=${data.sessionSaysHasScope}, actual=${data.hasCalendarScope}`
            );
          }
        } else {
          // On API error, trust session value
          setVerifiedScope(sessionHasScope);
        }
      } catch (err) {
        console.error("[useCalendarScope] Verification failed:", err);
        // On network error, trust session value
        setVerifiedScope(sessionHasScope);
      } finally {
        setIsVerifying(false);
      }
    };

    verify();
  }, [isLoggedIn, sessionHasScope, verifiedScope, isVerifying]);

  // Return verified value if available, otherwise session value
  const hasCalendarScope = verifiedScope ?? sessionHasScope;

  return {
    hasCalendarScope,
    isVerifying,
    // Expose whether we've completed verification (for loading states)
    isVerified: verifiedScope !== null,
    // Raw session value (for debugging)
    sessionHasScope,
  };
}
