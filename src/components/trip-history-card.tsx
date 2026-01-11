"use client";

import { useState } from "react";
import Link from "next/link";
import { Plane, Share2, Trash2, X, Clock, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getTripStatus } from "@/lib/trip-status";

interface TripHistoryCardProps {
  id: string;
  routeLabel: string | null;
  originTz: string;
  destTz: string;
  departureDatetime: string;
  code: string | null;
  differences?: string[];
  onDelete: (id: string) => Promise<void>;
}

export function TripHistoryCard({
  id,
  routeLabel,
  originTz,
  destTz,
  departureDatetime,
  code,
  differences = [],
  onDelete,
}: TripHistoryCardProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRemoved, setIsRemoved] = useState(false);

  const handleDeleteClick = () => {
    setConfirmingDelete(true);
  };

  const handleCancelDelete = () => {
    setConfirmingDelete(false);
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(id);
      setIsRemoved(true);
    } catch (error) {
      console.error("Failed to delete trip:", error);
      setIsDeleting(false);
      setConfirmingDelete(false);
    }
  };

  if (isRemoved) {
    return null;
  }

  const status = getTripStatus(departureDatetime);
  const formattedDate = new Date(departureDatetime).toLocaleDateString(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    }
  );

  return (
    <Card
      className={`bg-white/90 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md ${
        isDeleting ? "scale-95 opacity-0" : "scale-100 opacity-100"
      } ${status.isPast ? "opacity-75" : ""}`}
    >
      <CardContent className="flex items-center justify-between py-4">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-full ${
              status.isPast ? "bg-slate-100" : "bg-sky-50"
            }`}
          >
            {status.isPast ? (
              <CheckCircle2 className="h-5 w-5 text-slate-400" />
            ) : (
              <Plane className="h-5 w-5 text-sky-500" />
            )}
          </div>
          <div>
            <div className="font-medium text-slate-900">
              {routeLabel || `${originTz} → ${destTz}`}
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-500 flex-wrap">
              <span>{formattedDate}</span>
              <span className="text-slate-300">·</span>
              <span
                className={`inline-flex items-center gap-1 ${
                  status.isUpcoming ? "text-sky-600" : "text-slate-400"
                }`}
              >
                {status.isUpcoming && <Clock className="h-3 w-3" />}
                {status.label}
              </span>
              {code && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="inline-flex items-center gap-1 text-sky-600">
                    <Share2 className="h-3 w-3" />
                    Shared
                  </span>
                </>
              )}
              {differences.map((diff) => (
                <span key={diff} className="inline-flex items-center gap-1">
                  <span className="text-slate-300">·</span>
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
                    {diff}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {confirmingDelete ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancelDelete}
                disabled={isDeleting}
                className="h-8 px-2 text-slate-500 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="h-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
              >
                {isDeleting ? "Deleting..." : "Delete?"}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDeleteClick}
                className="h-8 w-8 p-0 text-slate-400 hover:text-rose-500"
                aria-label="Delete trip"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={`/trip/${id}`}>View</Link>
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
