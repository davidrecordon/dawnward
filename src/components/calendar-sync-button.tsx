"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Calendar,
  Check,
  Loader2,
  RefreshCw,
  Trash2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { requestCalendarPermission } from "@/lib/calendar-auth";

interface CalendarSyncButtonProps {
  tripId: string;
}

interface SyncStatus {
  isSynced: boolean;
  lastSyncedAt: string | null;
  eventCount: number;
}

export function CalendarSyncButton({ tripId }: CalendarSyncButtonProps) {
  // Use session hook for real-time auth state (updates after OAuth callback)
  const { data: session, update: updateSession } = useSession();
  const isLoggedIn = !!session?.user;
  const sessionHasCalendarScope = session?.hasCalendarScope ?? false;

  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  // Track verified scope (actual token state from Google)
  const [verifiedHasScope, setVerifiedHasScope] = useState<boolean | null>(
    null
  );

  // Use verified scope if available, otherwise fall back to session
  const hasCalendarScope = verifiedHasScope ?? sessionHasCalendarScope;

  // AbortController to prevent race conditions on rapid clicks
  const abortControllerRef = useRef<AbortController | null>(null);

  // Refresh session after OAuth callback to get updated scope
  useEffect(() => {
    // Check if we just returned from OAuth (indicated by URL params)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has("callbackUrl") || urlParams.has("code")) {
      // Trigger session refresh to get updated calendar scope
      updateSession();
      // Clear verified state to re-verify after OAuth
      setVerifiedHasScope(null);
    }
  }, [updateSession]);

  // Verify actual token scope when session says we have calendar access
  // This catches cases where the stored scope is stale or revoked
  useEffect(() => {
    if (!isLoggedIn || !sessionHasCalendarScope) {
      setVerifiedHasScope(null);
      return;
    }

    // Only verify once per session (verifiedHasScope starts as null)
    if (verifiedHasScope !== null) return;

    const verifyScope = async () => {
      try {
        const response = await fetch("/api/calendar/verify");
        if (response.ok) {
          const data = await response.json();
          setVerifiedHasScope(data.hasCalendarScope);

          // If there's a mismatch, log it for debugging
          if (data.mismatch) {
            console.warn(
              "[Calendar] Scope mismatch detected:",
              `session says ${data.sessionSaysHasScope}, actual: ${data.hasCalendarScope}`
            );
          }
        }
      } catch (err) {
        console.error("[Calendar] Failed to verify scope:", err);
        // On error, trust the session value
      }
    };

    verifyScope();
  }, [isLoggedIn, sessionHasCalendarScope, verifiedHasScope]);

  // Fetch sync status on mount
  const fetchSyncStatus = useCallback(async () => {
    if (!isLoggedIn) return;

    try {
      const response = await fetch(`/api/calendar/sync?tripId=${tripId}`);
      if (response.ok) {
        const data = await response.json();
        setSyncStatus(data);
      }
    } catch (err) {
      console.error("Failed to fetch sync status:", err);
    }
  }, [isLoggedIn, tripId]);

  useEffect(() => {
    fetchSyncStatus();
  }, [fetchSyncStatus]);

  // Handle sync action
  const handleSync = async () => {
    if (!isLoggedIn) {
      // Redirect to sign in
      window.location.href = `/auth/signin?callbackUrl=/trip/${tripId}`;
      return;
    }

    if (!hasCalendarScope) {
      // Show auth prompt to grant calendar access
      setShowAuthPrompt(true);
      return;
    }

    // Cancel any in-flight request to prevent race conditions
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/calendar/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId }),
        signal: abortControllerRef.current.signal,
      });

      const data = await response.json();

      // Handle 403 (calendar access revoked or not granted) - prompt for re-auth
      if (response.status === 403) {
        setIsLoading(false);
        setShowAuthPrompt(true);
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || "Failed to sync");
      }

      setSyncStatus({
        isSynced: true,
        lastSyncedAt: new Date().toISOString(),
        eventCount: data.eventsCreated,
      });

      // Show warning if some events failed (207 Multi-Status)
      if (data.warning) {
        setError(data.warning);
      }
    } catch (err) {
      // Ignore abort errors (expected when cancelling previous request)
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to sync");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle unsync action
  const handleUnsync = async () => {
    // Cancel any in-flight request to prevent race conditions
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/calendar/sync?tripId=${tripId}`, {
        method: "DELETE",
        signal: abortControllerRef.current.signal,
      });

      // Handle 403 (calendar access revoked) - prompt for re-auth
      if (response.status === 403) {
        setIsLoading(false);
        setShowAuthPrompt(true);
        return;
      }

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to remove from calendar");
      }

      setSyncStatus({
        isSynced: false,
        lastSyncedAt: null,
        eventCount: 0,
      });
    } catch (err) {
      // Ignore abort errors (expected when cancelling previous request)
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to remove");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle calendar authorization
  const handleAuthorizeCalendar = () => {
    requestCalendarPermission(`/trip/${tripId}`);
  };

  // Not synced - show "Add to Calendar" button
  if (!syncStatus?.isSynced) {
    return (
      <>
        <Button
          variant="outline"
          className="flex-1 bg-white/70"
          onClick={handleSync}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Calendar className="mr-2 h-4 w-4" />
          )}
          Add to Calendar
        </Button>

        {/* Error display */}
        {error && (
          <div className="mt-2 flex items-center gap-2 text-sm text-red-600">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* Calendar authorization prompt */}
        <Dialog open={showAuthPrompt} onOpenChange={setShowAuthPrompt}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Connect Google Calendar</DialogTitle>
              <DialogDescription>
                To add your schedule to Google Calendar, we need permission to
                create events. We&apos;ll only add your Dawnward schedule — we
                never read your existing calendar.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-3 sm:gap-3">
              <Button
                variant="ghost"
                onClick={() => setShowAuthPrompt(false)}
                className="flex-1"
              >
                Not now
              </Button>
              <Button
                onClick={handleAuthorizeCalendar}
                className="flex-1 bg-amber-500 hover:bg-amber-600"
              >
                <Calendar className="mr-2 h-4 w-4" />
                Connect Calendar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Synced - show dropdown with options
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="flex-1 border-emerald-200 bg-emerald-50/70 text-emerald-700 hover:bg-emerald-100"
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Check className="mr-2 h-4 w-4" />
          )}
          Synced to Calendar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={handleSync}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Re-sync
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={handleUnsync}
          className="text-red-600 focus:text-red-600"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Remove from Calendar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
