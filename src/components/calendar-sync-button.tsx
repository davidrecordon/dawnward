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
  RotateCcw,
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
import { useCalendarScope } from "@/hooks/use-calendar-scope";

interface CalendarSyncButtonProps {
  tripId: string;
}

interface SyncStatus {
  isSynced: boolean;
  status: "syncing" | "completed" | "failed" | null;
  lastSyncedAt: string | null;
  eventCount: number;
  eventsCreated?: number;
  eventsFailed?: number;
  errorMessage?: string;
  errorCode?: string;
}

/** Polling configuration */
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_DURATION_MS = 120000; // 2 minutes

export function CalendarSyncButton({ tripId }: CalendarSyncButtonProps) {
  // Use session hook for real-time auth state (updates after OAuth callback)
  const { data: session, update: updateSession } = useSession();
  const isLoggedIn = !!session?.user;

  // Use verified scope from hook (verifies actual token with Google)
  const { hasCalendarScope } = useCalendarScope();

  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);

  // AbortController to prevent race conditions on rapid clicks
  const abortControllerRef = useRef<AbortController | null>(null);
  // Polling interval reference
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartTimeRef = useRef<number>(0);

  // Refresh session after OAuth callback to get updated scope
  useEffect(() => {
    // Check if we just returned from OAuth (indicated by URL params)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has("callbackUrl") || urlParams.has("code")) {
      // Trigger session refresh to get updated calendar scope
      updateSession();
    }
  }, [updateSession]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Stop polling helper
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // Fetch sync status
  const fetchSyncStatus = useCallback(async (): Promise<SyncStatus | null> => {
    if (!isLoggedIn) return null;

    try {
      const response = await fetch(`/api/calendar/sync?tripId=${tripId}`);
      if (response.ok) {
        return await response.json();
      }
    } catch (err) {
      console.error("Failed to fetch sync status:", err);
    }
    return null;
  }, [isLoggedIn, tripId]);

  // Poll for sync completion
  const pollForCompletion = useCallback(async () => {
    const elapsed = Date.now() - pollStartTimeRef.current;

    // Stop polling after max duration
    if (elapsed > MAX_POLL_DURATION_MS) {
      stopPolling();
      setIsLoading(false);
      setError("Sync is taking longer than expected. Please check back later.");
      return;
    }

    const status = await fetchSyncStatus();
    if (!status) return;

    if (status.status === "completed") {
      stopPolling();
      setIsLoading(false);
      setSyncStatus(status);

      // Show warning if some events failed
      if (status.eventsFailed && status.eventsFailed > 0) {
        setError(
          `${status.eventsCreated} events added, ${status.eventsFailed} failed`
        );
      } else {
        setError(null);
      }
    } else if (status.status === "failed") {
      stopPolling();
      setIsLoading(false);
      setSyncStatus(status);

      // Handle different error codes
      if (status.errorCode === "token_revoked") {
        setShowAuthPrompt(true);
      } else {
        setError(status.errorMessage || "Sync failed");
      }
    }
    // If still syncing, keep polling
  }, [fetchSyncStatus, stopPolling]);

  // Start polling
  const startPolling = useCallback(() => {
    stopPolling(); // Clear any existing interval
    pollStartTimeRef.current = Date.now();
    pollIntervalRef.current = setInterval(pollForCompletion, POLL_INTERVAL_MS);
  }, [pollForCompletion, stopPolling]);

  // Initial status fetch on mount
  useEffect(() => {
    fetchSyncStatus().then((status) => {
      if (status) {
        setSyncStatus(status);

        // If status is "syncing" from a previous request, start polling
        if (status.status === "syncing") {
          setIsLoading(true);
          startPolling();
        }
      }
    });
  }, [fetchSyncStatus, startPolling]);

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

    // Cancel any in-flight request and stop polling
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    stopPolling();
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

      // Handle 403 (calendar access revoked or not granted) - prompt for re-auth
      if (response.status === 403) {
        setIsLoading(false);
        setShowAuthPrompt(true);
        return;
      }

      // Handle server errors gracefully
      if (!response.ok) {
        // Try to parse error message from JSON, fall back to status text
        let errorMessage = "Failed to sync";
        try {
          const data = await response.json();
          errorMessage = data.error || errorMessage;
        } catch {
          // Response wasn't JSON (e.g., HTML error page)
          errorMessage =
            response.status >= 500
              ? "Server error. Please try again."
              : `Request failed (${response.status})`;
        }
        throw new Error(errorMessage);
      }

      // Parse successful response
      await response.json();

      // Update status to syncing and start polling
      setSyncStatus({
        isSynced: false,
        status: "syncing",
        lastSyncedAt: null,
        eventCount: 0,
      });

      startPolling();
    } catch (err) {
      // Ignore abort errors (expected when cancelling previous request)
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      setIsLoading(false);
      setError(err instanceof Error ? err.message : "Failed to sync");
    }
  };

  // Handle unsync action
  const handleUnsync = async () => {
    // Cancel any in-flight request and stop polling
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    stopPolling();
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

      // Handle server errors gracefully
      if (!response.ok) {
        let errorMessage = "Failed to remove from calendar";
        try {
          const data = await response.json();
          errorMessage = data.error || errorMessage;
        } catch {
          errorMessage =
            response.status >= 500
              ? "Server error. Please try again."
              : `Request failed (${response.status})`;
        }
        throw new Error(errorMessage);
      }

      setSyncStatus({
        isSynced: false,
        status: null,
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

  // Handle retry after failure
  const handleRetry = () => {
    setError(null);
    handleSync();
  };

  // Handle calendar authorization
  const handleAuthorizeCalendar = () => {
    requestCalendarPermission(`/trip/${tripId}`);
  };

  // Syncing state - show spinner with message
  if (
    syncStatus?.status === "syncing" ||
    (isLoading && !syncStatus?.isSynced)
  ) {
    return (
      <>
        <Button
          variant="outline"
          className="flex-1 bg-white/70"
          disabled={true}
        >
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Syncing to Calendar...
        </Button>

        {/* Error display */}
        {error && (
          <div className="mt-2 flex items-center gap-2 text-sm text-red-600">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}
      </>
    );
  }

  // Failed state - show retry option
  if (syncStatus?.status === "failed" && !isLoading) {
    return (
      <>
        <Button
          variant="outline"
          className="flex-1 border-red-200 bg-red-50/70 text-red-700 hover:bg-red-100"
          onClick={handleRetry}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Retry Sync
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
              <DialogTitle>Reconnect Google Calendar</DialogTitle>
              <DialogDescription>
                Your calendar access has expired or was revoked. Please
                reconnect to continue syncing your schedule.
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
                Reconnect Calendar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

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
    <>
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

      {/* Error/warning display - same pattern as unsynced state */}
      {error && (
        <div className="mt-2 flex items-center gap-2 text-sm text-amber-600">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}
    </>
  );
}
