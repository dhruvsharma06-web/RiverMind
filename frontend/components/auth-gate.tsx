"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/shared";
import { WorkspacePlaceholder } from "./workspace-placeholder";

export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (status === "signed-out")
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, pathname, router]);
  if (status === "loading") return <WorkspacePlaceholder />;
  if (status !== "signed-in")
    return (
      <div className="auth-loading" role="status" aria-live="polite">
        Redirecting to sign in…
      </div>
    );
  return <>{children}</>;
}

export function CouncilOnly({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const router = useRouter();
  if (user?.role === "council") return <>{children}</>;
  return (
    <div className="council-gateway">
      <Panel>
        <span className="gateway-symbol">
          <ShieldCheck size={32} strokeWidth={1.2} />
        </span>
        <h2>Council access only</h2>
        <p>
          You are signed in as {user?.name ?? "a worker"}. Switch to a council
          account to review payments.
        </p>
        <div className="form-actions">
          <Button
            onClick={() =>
              void signOut().then(() => router.replace("/login?next=/council"))
            }
          >
            Sign out and switch account
          </Button>
          <Button asChild variant="secondary">
            <Link href="/river">Back to overview</Link>
          </Button>
        </div>
      </Panel>
    </div>
  );
}

/** Shown in place of claim / proof / donate actions when the session is missing or expired. */
export function SignInPrompt() {
  const pathname = usePathname();
  return (
    <Panel className="sign-in-prompt">
      <h2>Sign in to continue</h2>
      <p>
        Your session is not active. Sign in to claim quests, submit proof, or
        donate.
      </p>
      <Button asChild>
        <Link href={`/login?next=${encodeURIComponent(pathname)}`}>
          Sign in to continue
        </Link>
      </Button>
    </Panel>
  );
}
