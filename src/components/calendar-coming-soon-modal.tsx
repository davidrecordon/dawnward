"use client";

import { Calendar, Bell, Sparkles } from "lucide-react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface CalendarComingSoonModalProps {
  open: boolean;
  onClose: () => void;
  isSignedIn: boolean;
  userEmail?: string | null;
}

export function CalendarComingSoonModal({
  open,
  onClose,
  isSignedIn,
  userEmail,
}: CalendarComingSoonModalProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="overflow-hidden border-0 bg-white p-0 shadow-xl sm:max-w-md"
      >
        {/* Gradient accent bar - calendar/orange themed */}
        <div
          className="h-1.5 w-full"
          style={{
            background:
              "linear-gradient(90deg, #F59E0B 0%, #F97316 50%, #EF4444 100%)",
          }}
        />

        <div className="px-6 pt-6 pb-6">
          <DialogHeader className="gap-4">
            {/* Animated icon container */}
            <div className="relative mx-auto">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-50 to-orange-100">
                <Calendar className="h-8 w-8 text-orange-500" />
              </div>
              <div className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 shadow-sm">
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </div>
            </div>

            <DialogTitle className="text-center text-xl tracking-tight">
              Calendar Sync Coming Soon
            </DialogTitle>

            <DialogDescription className="text-center leading-relaxed text-slate-600">
              {isSignedIn ? (
                <>
                  We&apos;re building Google Calendar integration so your
                  schedule syncs automatically. We&apos;ll let you know at{" "}
                  <span className="font-medium text-slate-700">
                    {userEmail}
                  </span>{" "}
                  when it&apos;s ready!
                </>
              ) : (
                <>
                  We&apos;re building Google Calendar integration so your
                  schedule syncs automatically.
                  <span className="mt-3 flex items-center justify-center gap-2 text-amber-700">
                    <Bell className="h-4 w-4" />
                    <span className="font-medium">
                      Sign in to get notified when it launches
                    </span>
                  </span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-6 gap-3 sm:gap-3">
            {isSignedIn ? (
              <Button
                onClick={onClose}
                className="w-full bg-amber-500 text-white hover:bg-amber-600"
              >
                Got it, thanks!
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  onClick={onClose}
                  className="flex-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                >
                  Maybe later
                </Button>
                <Button
                  asChild
                  className="flex-1 bg-amber-500 text-white hover:bg-amber-600"
                >
                  <Link href="/auth/signin">Sign In</Link>
                </Button>
              </>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
