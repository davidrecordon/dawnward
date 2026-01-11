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
import { Input } from "@/components/ui/input";
import {
  getInterventionStyle,
  formatTime,
  formatShortDate,
} from "@/lib/intervention-utils";
import { useMediaQuery, MD_BREAKPOINT_QUERY } from "@/hooks/use-media-query";
import type { Intervention } from "@/types/schedule";

type ActualStatus = "as_planned" | "modified" | "skipped";

interface RecordActualSheetProps {
  open: boolean;
  onClose: () => void;
  tripId: string;
  intervention: Intervention;
  dayOffset: number;
  date: string;
  legIndex?: number;
}

export function RecordActualSheet({
  open,
  onClose,
  tripId,
  intervention,
  dayOffset,
  date,
  legIndex = 0,
}: RecordActualSheetProps) {
  const [status, setStatus] = React.useState<ActualStatus>("as_planned");
  const [actualTime, setActualTime] = React.useState(intervention.time);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Use Dialog on desktop (md+), Drawer on mobile
  const isDesktop = useMediaQuery(MD_BREAKPOINT_QUERY);

  // Reset state when opened with new intervention
  React.useEffect(() => {
    if (open) {
      setStatus("as_planned");
      setActualTime(intervention.time);
      setError(null);
    }
  }, [open, intervention]);

  const style = getInterventionStyle(intervention.type);
  const Icon = style.icon;
  const formattedTime = formatTime(intervention.time);
  const formattedDate = formatShortDate(date);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/trips/${tripId}/actuals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legIndex,
          dayOffset,
          interventionType: intervention.type,
          plannedTime: intervention.time,
          actualTime: status === "modified" ? actualTime : null,
          status,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save");
      }

      onClose();
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

  // Shared form content (radio options)
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
          <span className="font-medium">Done as planned</span>
          <span className="block text-sm text-slate-500">
            Completed at {formattedTime}
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
            <span className="font-medium">Done at different time</span>
          </Label>
        </div>
        {status === "modified" && (
          <div className="mt-3 pl-7">
            <Label htmlFor="actual-time" className="text-sm text-slate-600">
              Actual time
            </Label>
            <Input
              id="actual-time"
              type="time"
              value={actualTime}
              onChange={(e) => setActualTime(e.target.value)}
              className="mt-1 w-32"
            />
          </div>
        )}
      </div>

      {/* Skipped */}
      <div className="flex items-center space-x-3 rounded-lg border border-slate-200 bg-white p-3">
        <RadioGroupItem value="skipped" id="skipped" />
        <Label htmlFor="skipped" className="flex-1 cursor-pointer">
          <span className="font-medium">Skipped</span>
          <span className="block text-sm text-slate-500">
            Didn&apos;t complete this intervention
          </span>
        </Label>
      </div>
    </RadioGroup>
  );

  // Shared footer buttons
  const footerContent = (
    <div className="flex gap-3">
      <Button
        variant="ghost"
        onClick={onClose}
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
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
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
    <Drawer open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
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
