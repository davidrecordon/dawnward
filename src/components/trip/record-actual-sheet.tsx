"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  getInterventionStyle,
  formatTime,
  formatShortDate,
  isEditableIntervention,
} from "@/lib/intervention-utils";
import { useMediaQuery, MD_BREAKPOINT_QUERY } from "@/hooks/use-media-query";
import { TimeSelect } from "@/components/ui/time-select";
import type { Intervention, InterventionActual } from "@/types/schedule";
import { getDisplayTime } from "@/types/schedule";

type ActualStatus = "as_planned" | "modified" | "skipped";

/**
 * Save an actual to the API and return the saved data.
 * Extracted to avoid duplication between main save and child cascade.
 */
async function saveActualToApi(
  tripId: string,
  legIndex: number,
  dayOffset: number,
  interventionType: string,
  plannedTime: string,
  actualTime: string | null,
  status: ActualStatus
): Promise<InterventionActual> {
  const response = await fetch(`/api/trips/${tripId}/actuals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      legIndex,
      dayOffset,
      interventionType,
      plannedTime,
      actualTime,
      status,
    }),
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || "Failed to save");
  }

  const { actual } = await response.json();
  return {
    dayOffset: actual.dayOffset,
    interventionType: actual.interventionType,
    plannedTime: actual.plannedTime,
    actualTime: actual.actualTime,
    status: actual.status,
  };
}

interface RecordActualSheetProps {
  open: boolean;
  /** Called when actuals are saved successfully (array supports parent cascade) */
  onSave: (actuals: InterventionActual[]) => void;
  /** Called when the user cancels without saving */
  onCancel: () => void;
  tripId: string;
  intervention: Intervention;
  dayOffset: number;
  date: string;
  legIndex?: number;
  /** Existing actual data (for editing previously recorded actuals) */
  actual?: InterventionActual;
  /** Nested children interventions (for parent cascade when editing parent) */
  nestedChildren?: Intervention[];
}

export function RecordActualSheet({
  open,
  onSave,
  onCancel,
  tripId,
  intervention,
  dayOffset,
  date,
  legIndex = 0,
  actual,
  nestedChildren,
}: RecordActualSheetProps) {
  // Get the display time for this intervention (origin_time for prep, dest_time for post-arrival)
  const displayTime = getDisplayTime(intervention);

  const [status, setStatus] = React.useState<ActualStatus>("as_planned");
  const [actualTime, setActualTime] = React.useState(displayTime);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Use Dialog on desktop (md+), Drawer on mobile
  const isDesktop = useMediaQuery(MD_BREAKPOINT_QUERY);

  // Initialize state from existing actual (if editing) or reset to defaults
  React.useEffect(() => {
    if (open) {
      setStatus(actual?.status ?? "as_planned");
      setActualTime(actual?.actualTime ?? displayTime);
      setError(null);
    }
  }, [open, displayTime, actual]);

  const style = getInterventionStyle(intervention.type);
  const Icon = style.icon;
  const formattedTime = formatTime(displayTime);
  const formattedDate = formatShortDate(date);

  // Check if this intervention is in the past (for tense-aware copy)
  const isPast = (() => {
    const interventionDateTime = new Date(`${date}T${displayTime}`);
    return interventionDateTime < new Date();
  })();

  // Wake and sleep targets can't be skipped - they're anchors for the schedule
  const canBeSkipped =
    intervention.type !== "wake_target" && intervention.type !== "sleep_target";

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const savedActuals: InterventionActual[] = [];

      // Save the main intervention's actual
      const mainActual = await saveActualToApi(
        tripId,
        legIndex,
        dayOffset,
        intervention.type,
        displayTime,
        status === "modified" ? actualTime : null,
        status
      );
      savedActuals.push(mainActual);

      // If this is a parent with children and status is "modified",
      // cascade the time change to editable children
      if (
        status === "modified" &&
        nestedChildren &&
        nestedChildren.length > 0
      ) {
        const cascadeErrors: string[] = [];

        for (const child of nestedChildren) {
          // Only cascade to editable children
          if (!isEditableIntervention(child.type)) continue;

          try {
            const childActual = await saveActualToApi(
              tripId,
              legIndex,
              dayOffset,
              child.type,
              getDisplayTime(child),
              actualTime,
              "modified"
            );
            savedActuals.push(childActual);
          } catch (err) {
            // Log cascade failures but don't block the main save
            const errorMsg = err instanceof Error ? err.message : "Failed";
            cascadeErrors.push(`${child.title || child.type}: ${errorMsg}`);
            console.warn(`Failed to cascade to ${child.type}:`, err);
          }
        }

        // Show warning if some cascades failed (but main save succeeded)
        if (cascadeErrors.length > 0) {
          console.warn("Some nested items failed to save:", cascadeErrors);
        }
      }

      // Return all saved actuals to the parent
      onSave(savedActuals);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  // Shared header content
  const headerContent = (
    <div className="flex items-center gap-3">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${style.bgColor}`}
      >
        <Icon className={`h-5 w-5 ${style.textColor}`} />
      </div>
      <div>
        <div className="font-semibold">{intervention.title}</div>
        <div className="text-sm text-slate-500">
          {formattedDate} · {formattedTime}
        </div>
      </div>
    </div>
  );

  // Shared form content (radio options) with tense-aware copy
  const formContent = (
    <RadioGroup
      value={status}
      onValueChange={(value) => setStatus(value as ActualStatus)}
      className="space-y-3"
    >
      {/* As planned */}
      <div className="flex items-center space-x-3 rounded-lg border border-slate-200 bg-white p-3">
        <RadioGroupItem value="as_planned" id="as_planned" />
        <Label htmlFor="as_planned" className="flex-1 cursor-pointer">
          <span className="font-medium">
            {isPast ? "Done as planned" : "Will do as planned"}
          </span>
          <span className="text-sm text-slate-500">
            {isPast ? `completed at ${formattedTime}` : `at ${formattedTime}`}
          </span>
        </Label>
      </div>

      {/* Modified time */}
      <div
        className={`rounded-lg border p-3 transition-colors ${
          status === "modified"
            ? "border-sky-300 bg-sky-50"
            : "border-slate-200 bg-white"
        }`}
      >
        <div className="flex items-center space-x-3">
          <RadioGroupItem value="modified" id="modified" />
          <Label htmlFor="modified" className="flex-1 cursor-pointer">
            <span className="font-medium">
              {isPast ? "Done at different time" : "Will do at different time"}
            </span>
          </Label>
        </div>
        {status === "modified" && (
          <div className="mt-3 pl-7">
            <Label className="text-sm text-slate-600">
              {isPast ? "Actual time" : "Planned time"}
            </Label>
            <TimeSelect
              value={actualTime}
              onChange={setActualTime}
              className="mt-1 w-36"
            />
          </div>
        )}
      </div>

      {/* Skipped - not available for wake/sleep targets */}
      {canBeSkipped && (
        <div className="flex items-center space-x-3 rounded-lg border border-slate-200 bg-white p-3">
          <RadioGroupItem value="skipped" id="skipped" />
          <Label htmlFor="skipped" className="flex-1 cursor-pointer">
            <span className="font-medium">
              {isPast ? "Skipped" : "Will skip"}
            </span>
            <span className="block text-sm text-slate-500">
              {isPast ? "Didn't" : "Won't"} complete this
            </span>
          </Label>
        </div>
      )}
    </RadioGroup>
  );

  // Shared footer buttons
  const footerContent = (
    <div className="flex gap-3">
      <Button
        variant="ghost"
        onClick={onCancel}
        disabled={isSaving}
        className="flex-1"
      >
        Cancel
      </Button>
      <Button
        onClick={handleSave}
        disabled={isSaving}
        className="flex-1 bg-sky-500 hover:bg-sky-600"
      >
        {isSaving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Saving...
          </>
        ) : (
          "Save"
        )}
      </Button>
    </div>
  );

  // Desktop: Centered Dialog modal
  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
        <DialogContent
          showCloseButton={false}
          className="overflow-hidden border-0 bg-white p-0 shadow-xl sm:max-w-md"
        >
          {/* Gradient accent bar (matches edit-preferences-modal) */}
          <div
            className="h-1.5 w-full"
            style={{
              background:
                "linear-gradient(90deg, #3B9CC9 0%, #7DBB9C 50%, #E8B456 100%)",
            }}
          />

          <div className="px-6 pt-5 pb-6">
            <DialogHeader className="gap-3">
              {headerContent}
              <DialogTitle className="sr-only">
                Record {intervention.title}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Record when you completed this intervention
              </DialogDescription>
            </DialogHeader>

            <div className="mt-6">{formContent}</div>

            {error && (
              <p className="mt-4 text-center text-sm text-red-600">{error}</p>
            )}

            <DialogFooter className="mt-6">{footerContent}</DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Mobile: Bottom sheet Drawer
  return (
    <Drawer open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DrawerContent>
        <DrawerHeader>
          {headerContent}
          <DrawerTitle className="sr-only">
            Record {intervention.title}
          </DrawerTitle>
          <DrawerDescription className="sr-only">
            Record when you completed this intervention
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-4">
          {formContent}

          {error && (
            <p className="mt-4 text-center text-sm text-red-600">{error}</p>
          )}
        </div>

        <DrawerFooter>{footerContent}</DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
