import type { Metadata } from "next";
import { ReportsWorkspace } from "@/components/reports-workspace";

export const metadata: Metadata = { title: "Monthly reports" };
export default function ReportsPage() {
  return <ReportsWorkspace />;
}
