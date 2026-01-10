"use client";

import { SessionProvider } from "next-auth/react";
import { SaveStatusProvider } from "@/components/save-status-context";

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <SessionProvider>
      <SaveStatusProvider>{children}</SaveStatusProvider>
    </SessionProvider>
  );
}
