import type { ReactNode } from "react";
import { CouncilOnly } from "@/components/auth-gate";
export const metadata = { title: "Council workspace" };
export default function Layout({ children }: { children: ReactNode }) {
  return <CouncilOnly>{children}</CouncilOnly>;
}
