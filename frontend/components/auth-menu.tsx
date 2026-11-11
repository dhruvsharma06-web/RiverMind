"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/auth";

export function AuthMenu({ next = "/river" }: { next?: string }) {
  const { user, status, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const action = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    action.current?.focus();
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  if (status === "loading")
    return <span className="auth-placeholder" aria-hidden="true" />;
  if (!user)
    return (
      <Link
        className="auth-signin"
        href={`/login?next=${encodeURIComponent(next)}`}
      >
        Sign in
      </Link>
    );
  const first = user.name.trim().split(/\s+/)[0] || "Account";
  return (
    <div
      className="auth-menu"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="auth-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        <span className="auth-name">{first}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={panelId}
          className="auth-popover"
          role="group"
          aria-label="Account"
        >
          <p className="auth-who">
            {user.name}
            <span className="auth-role" data-role={user.role}>
              {user.role === "council" ? "Council" : "Worker"}
            </span>
          </p>
          <small>{user.email}</small>
          <button
            ref={action}
            type="button"
            className="auth-signout"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
