"use client";

import { X } from "lucide-react";

interface FormErrorProps {
  message: string;
  onDismiss: () => void;
}

export function FormError({ message, onDismiss }: FormErrorProps) {
  return (
    <div className="animate-in fade-in slide-in-from-top-2 mb-4 duration-300">
      <div className="flex items-start gap-3 rounded-xl border border-[#F4A574]/30 bg-[#F4A574]/10 p-4 backdrop-blur-sm">
        <p className="flex-1 text-sm text-slate-700">{message}</p>

        <button
          onClick={onDismiss}
          className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-white/50 hover:text-slate-600"
          aria-label="Dismiss error"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
