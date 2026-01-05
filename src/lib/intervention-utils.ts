/**
 * Intervention styling utilities
 * Maps intervention types to icons and colors based on the design system
 */

import {
  Sun,
  EyeOff,
  Pill,
  Coffee,
  Activity,
  Moon,
  type LucideIcon,
} from "lucide-react";
import type { InterventionType } from "@/types/schedule";

interface InterventionStyle {
  icon: LucideIcon;
  bgColor: string;
  textColor: string;
  label: string;
}

/**
 * Get styling for an intervention type
 */
export function getInterventionStyle(type: InterventionType): InterventionStyle {
  switch (type) {
    case "light_seek":
      return {
        icon: Sun,
        bgColor: "bg-amber-100",
        textColor: "text-amber-600",
        label: "Seek Light",
      };
    case "light_avoid":
      return {
        icon: EyeOff,
        bgColor: "bg-indigo-100",
        textColor: "text-indigo-600",
        label: "Avoid Light",
      };
    case "melatonin":
      return {
        icon: Pill,
        bgColor: "bg-emerald-100",
        textColor: "text-emerald-600",
        label: "Melatonin",
      };
    case "caffeine_ok":
      return {
        icon: Coffee,
        bgColor: "bg-orange-100",
        textColor: "text-orange-600",
        label: "Caffeine OK",
      };
    case "caffeine_cutoff":
      return {
        icon: Coffee,
        bgColor: "bg-slate-100",
        textColor: "text-slate-500",
        label: "Caffeine Cutoff",
      };
    case "exercise":
      return {
        icon: Activity,
        bgColor: "bg-sky-100",
        textColor: "text-sky-600",
        label: "Exercise",
      };
    case "sleep_target":
      return {
        icon: Moon,
        bgColor: "bg-purple-100",
        textColor: "text-purple-600",
        label: "Sleep Target",
      };
    case "wake_target":
      return {
        icon: Sun,
        bgColor: "bg-amber-100",
        textColor: "text-amber-600",
        label: "Wake Target",
      };
    default:
      return {
        icon: Sun,
        bgColor: "bg-slate-100",
        textColor: "text-slate-600",
        label: "Unknown",
      };
  }
}

/**
 * Format time from HH:MM to a more readable format
 */
export function formatTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`;
}

/**
 * Get a friendly label for a day number
 */
export function getDayLabel(day: number): string {
  if (day < 0) {
    return `Day ${day}`;
  } else if (day === 0) {
    return "Flight Day";
  } else if (day === 1) {
    return "Arrival";
  } else {
    return `Day +${day}`;
  }
}

/**
 * Format a date string to a short format (e.g., "Jan 28")
 */
export function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
