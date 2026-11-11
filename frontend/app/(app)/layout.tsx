import { AppShell } from "@/components/app-shell";
import { AuthGate } from "@/components/auth-gate";
export default function ApplicationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      <AuthGate>{children}</AuthGate>
    </AppShell>
  );
}
