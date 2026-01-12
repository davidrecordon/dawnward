"use client";

import { useCallback, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
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
import { CALENDAR_SCOPES } from "@/auth.config";

interface CalendarSyncButtonProps {
  tripId: string;
  isLoggedIn: boolean;
  hasCalendarScope: boolean;
}

interface SyncStatus {
  isSynced: boolean;
  lastSyncedAt: string | null;
  eventCount: number;
}

export function CalendarSyncButton({
  tripId,
  isLoggedIn,
  hasCalendarScope,
}: CalendarSyncButtonProps) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);

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

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/calendar/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to sync");
      }

      const data = await response.json();
      setSyncStatus({
        isSynced: true,
        lastSyncedAt: new Date().toISOString(),
        eventCount: data.eventsCreated,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle unsync action
  const handleUnsync = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/calendar/sync?tripId=${tripId}`, {
        method: "DELETE",
      });

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
      setError(err instanceof Error ? err.message : "Failed to remove");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle calendar authorization
  const handleAuthorizeCalendar = () => {
    // Sign in with calendar scope, then redirect back
    signIn("google", {
      callbackUrl: `/trip/${tripId}`,
      scope: CALENDAR_SCOPES,
    });
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
