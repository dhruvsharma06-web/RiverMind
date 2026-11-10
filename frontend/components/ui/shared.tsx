import {
  AlertCircle,
  ArrowUpRight,
  Check,
  Compass,
  RefreshCw,
  Waves,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { Button } from "./button";
import { cn } from "@/lib/utils";
import { statusLabels } from "@/lib/format";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="brand" aria-label="RiverMind home">
      <span className="brand-mark">
        <Waves size={24} strokeWidth={1.4} />
      </span>
      {!compact && (
        <span>
          river<span className="text-primary">mind</span>
          <span className="brand-period">.</span>
        </span>
      )}
    </Link>
  );
}
export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("eyebrow", className)}>
      <span aria-hidden="true" className="eyebrow-line" />
      {children}
    </p>
  );
}
export function Badge({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode;
  tone?: "muted" | "aqua" | "gold" | "red";
  className?: string;
}) {
  return (
    <span className={cn("badge", `badge-${tone}`, className)}>{children}</span>
  );
}
export function StatusBadge({ status }: { status: string }) {
  const tone = ["PAID", "SUCCEEDED", "VERIFIED"].includes(status)
    ? "aqua"
    : ["REJECTED", "FAILED", "PAYOUT_FAILED", "VETOED"].includes(status)
      ? "red"
      : ["OPEN", "PENDING_APPROVAL", "PAYOUT_PENDING_APPROVAL"].includes(status)
        ? "gold"
        : "muted";
  return <Badge tone={tone}>{statusLabels[status] ?? status}</Badge>;
}
export function PageHeading({
  chapter,
  title,
  description,
  action,
}: {
  chapter: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <Eyebrow>{chapter}</Eyebrow>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}
export function Panel({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("panel", className)}>
      {children}
    </section>
  );
}
export function PanelTitle({
  children,
  aside,
}: {
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="panel-title">
      <h2>{children}</h2>
      {aside}
    </div>
  );
}
export function EmptyState({
  title = "A quiet stretch for now.",
  children,
  href,
  action,
}: {
  title?: string;
  children?: ReactNode;
  href?: string;
  action?: string;
}) {
  return (
    <div className="empty-state">
      <Compass size={30} strokeWidth={1} />
      <h3>{title}</h3>
      <p>
        {children ??
          "There is nothing to show here yet. New activity will appear as the river's story unfolds."}
      </p>
      {href && (
        <Button asChild variant="secondary">
          <Link href={href}>
            {action ?? "Explore the river"}
            <ArrowUpRight size={15} />
          </Link>
        </Button>
      )}
    </div>
  );
}
export function ErrorNotice({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return (
    <div role="alert" className="notice notice-error">
      <AlertCircle size={18} />
      <div>
        <strong>We couldn’t load this stretch.</strong>
        <p>{error instanceof Error ? error.message : "Please try again."}</p>
      </div>
      {retry && (
        <Button variant="ghost" size="sm" onClick={retry}>
          <RefreshCw size={14} />
          Retry
        </Button>
      )}
    </div>
  );
}
export function Notice({
  children,
  success = false,
}: {
  children: ReactNode;
  success?: boolean;
}) {
  return (
    <div className={cn("notice", success && "notice-success")} role="status">
      {success ? <Check size={18} /> : <AlertCircle size={18} />}
      <div>{children}</div>
    </div>
  );
}
export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div
      className="skeleton-stack"
      role="status"
      aria-label="Loading river information"
    >
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{ width: `${100 - i * 12}%` }}
        />
      ))}
    </div>
  );
}
export function AsyncView<T>({
  query,
  children,
}: {
  query: UseQueryResult<T, Error>;
  children: (data: T) => ReactNode;
}) {
  if (query.data !== undefined)
    return (
      <>
        {query.isError && (
          <ErrorNotice error={query.error} retry={() => void query.refetch()} />
        )}
        {children(query.data)}
      </>
    );
  if (query.isPending) return <Skeleton />;
  return <ErrorNotice error={query.error} retry={() => void query.refetch()} />;
}
