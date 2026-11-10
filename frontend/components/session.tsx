"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
const CouncilContext = createContext<{
  key: string;
  setKey: (key: string) => void;
}>({ key: "", setKey: () => {} });
export function CouncilSession({ children }: { children: ReactNode }) {
  const [key, setKey] = useState("");
  return (
    <CouncilContext.Provider value={{ key, setKey }}>
      {children}
    </CouncilContext.Provider>
  );
}
export const useCouncilSession = () => useContext(CouncilContext);
