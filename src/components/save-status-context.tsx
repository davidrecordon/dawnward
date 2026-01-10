"use client";

import * as React from "react";

type SaveStatus = "idle" | "saving" | "saved";

interface SaveStatusContextType {
  status: SaveStatus;
  setStatus: (status: SaveStatus) => void;
}

const SaveStatusContext = React.createContext<SaveStatusContextType | null>(
  null
);

export function SaveStatusProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [status, setStatus] = React.useState<SaveStatus>("idle");

  return (
    <SaveStatusContext.Provider value={{ status, setStatus }}>
      {children}
    </SaveStatusContext.Provider>
  );
}

export function useSaveStatus() {
  const context = React.useContext(SaveStatusContext);
  if (!context) {
    // Return a no-op version if not wrapped in provider (e.g., on non-settings pages)
    return { status: "idle" as SaveStatus, setStatus: () => {} };
  }
  return context;
}
