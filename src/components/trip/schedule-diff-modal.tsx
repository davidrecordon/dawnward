"use client";

import * as React from "react";
import { ArrowRight, Loader2, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getDayLabel } from "@/lib/intervention-utils";

interface ScheduleChange {
  day: number;
  type: string;
  old_time: string | null;
  new_time: string;
  description: string;
}

interface ScheduleDiffModalProps {
  open: boolean;
  onClose: () => void;
  changes: ScheduleChange[];
  restoredFromDay: number;
  onAccept: () => void;
  onDismiss: () => void;
  isApplying?: boolean;
}

/**
 * Modal showing the diff between current and recalculated schedule.
 * Allows user to accept or dismiss the changes.
 */
export function ScheduleDiffModal({
  open,
  onClose,
  changes,
  restoredFromDay,
  onAccept,
  onDismiss,
  isApplying = false,
}: ScheduleDiffModalProps) {
  // Group changes by day
  const changesByDay = React.useMemo(() => {
    const grouped: Record<number, ScheduleChange[]> = {};
    for (const change of changes) {
      if (!grouped[change.day]) {
        grouped[change.day] = [];
      }
      grouped[change.day].push(change);
    }
    return grouped;
  }, [changes]);

  const sortedDays = Object.keys(changesByDay)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="overflow-hidden border-0 bg-white p-0 shadow-xl sm:max-w-md"
      >
        {/* Gradient accent bar */}
        <div
          className="h-1.5 w-full"
          style={{
            background:
              "linear-gradient(90deg, #F4A574 0%, #E8B456 50%, #7DBB9C 100%)",
          }}
        />

        <div className="px-6 pt-5 pb-6">
          <DialogHeader className="gap-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
              <RefreshCw className="h-6 w-6 text-amber-600" />
            </div>
            <DialogTitle className="text-center text-xl tracking-tight">
              Schedule Changes
            </DialogTitle>
            <DialogDescription className="text-center text-slate-600">
              Your schedule has been adjusted based on your actual timing
              {restoredFromDay < 0 &&
                ` from ${getDayLabel(restoredFromDay + 1, false)}`}
              .
            </DialogDescription>
          </DialogHeader>

          {/* Changes list */}
          <div className="mt-6 max-h-[300px] space-y-4 overflow-y-auto">
            {sortedDays.map((day) => (
              <div key={day} className="rounded-lg bg-slate-50 p-3">
                <h4 className="mb-2 text-sm font-semibold text-slate-700">
                  {getDayLabel(day, false)}
                </h4>
                <div className="space-y-2">
                  {changesByDay[day].map((change, idx) => (
                    <div
                      key={`${change.type}-${idx}`}
                      className="flex items-center gap-2 text-sm"
                    >
                      <span className="text-slate-500">•</span>
                      {change.old_time ? (
                        <span className="text-slate-600">
                          <span className="capitalize">
                            {change.type.replace(/_/g, " ")}
                          </span>
                          :{" "}
                          <span className="text-slate-400 line-through">
                            {change.old_time}
                          </span>{" "}
                          <ArrowRight className="mx-1 inline h-3 w-3 text-slate-400" />
                          <span className="font-medium text-slate-800">
                            {change.new_time}
                          </span>
                        </span>
                      ) : (
                        <span className="text-slate-600">
                          {change.description}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {changes.length === 0 && (
              <p className="text-center text-sm text-slate-500">
                No significant changes detected.
              </p>
            )}
          </div>

          <DialogFooter className="mt-6 gap-3 sm:gap-3">
            <Button
              variant="ghost"
              onClick={onDismiss}
              disabled={isApplying}
              className="flex-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              Dismiss
            </Button>
            <Button
              onClick={onAccept}
              disabled={isApplying}
              className="flex-1 bg-amber-500 text-white hover:bg-amber-600"
            >
              {isApplying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Applying...
                </>
              ) : (
                "Accept Changes"
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
