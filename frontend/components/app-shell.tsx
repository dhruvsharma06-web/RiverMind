"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  BookOpen,
  Compass,
  FileChartColumn,
  Heart,
  LayoutDashboard,
  Map,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { Logo } from "./ui/shared";
import { ThemeToggle } from "./theme-toggle";
import { AuthMenu } from "./auth-menu";
import { WorkspacePage } from "./workspace-page";
import { cn } from "@/lib/utils";
const links = [
  { href: "/river", label: "Overview", icon: LayoutDashboard },
  { href: "/atlas", label: "River atlas", icon: Map },
  { href: "/bounties", label: "Cleanup quests", icon: Compass },
  { href: "/donate", label: "River treasury", icon: Heart },
  { href: "/reports", label: "Monthly reports", icon: FileChartColumn },
  { href: "/about", label: "How it works", icon: BookOpen },
];
const routeOrder = [...links.map(({ href }) => href), "/council"];
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const shell = useRef<HTMLDivElement>(null);
  const topbar = useRef<HTMLElement>(null);
  useEffect(() => {
    const root = shell.current;
    if (!root) return;
    let timer = 0;
    let last = 0;
    const working = (event: Event) => {
      if (
        event.type === "pointerover" &&
        !(
          event.target instanceof Element &&
          event.target.closest("a, button, input, select, textarea")
        )
      )
        return;
      const now = performance.now();
      if (now - last < 400) return;
      last = now;
      if (root.dataset.working !== "true") root.dataset.working = "true";
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        delete root.dataset.working;
      }, 1600);
    };
    root.addEventListener("pointerover", working, { passive: true });
    root.addEventListener("pointerdown", working, { passive: true });
    root.addEventListener("pointermove", working, { passive: true });
    root.addEventListener("keydown", working);
    return () => {
      window.clearTimeout(timer);
      root.removeEventListener("pointerover", working);
      root.removeEventListener("pointerdown", working);
      root.removeEventListener("pointermove", working);
      root.removeEventListener("keydown", working);
    };
  }, []);
  useEffect(() => {
    const header = topbar.current;
    if (!header) return;
    const measure = () =>
      shell.current?.style.setProperty(
        "--workspace-header-height",
        `${header.getBoundingClientRect().height}px`,
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={shell}
      className={cn(
        "app-shell",
        collapsed && "sidebar-collapsed",
        pathname === "/river" && "overview-workspace",
        pathname === "/about" && "about-workspace",
      )}
    >
      <aside className="app-sidebar" id="workspace-sidebar">
        <Logo compact={collapsed} />
        <div className="sidebar-chapter">
          WORKSPACE<span>Yamuna, Delhi</span>
        </div>
        <nav aria-label="Application navigation">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-label={label}
              title={collapsed ? label : undefined}
              aria-current={pathname.startsWith(href) ? "page" : undefined}
              className={cn(
                "sidebar-link",
                pathname.startsWith(href) && "active",
              )}
            >
              <Icon size={18} strokeWidth={1.5} />
              <span className="sidebar-label">{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="sidebar-note-kicker">OPEN QUESTS</span>
          <p>Find a cleanup to claim.</p>
          <Link href="/bounties">
            Find a cleanup quest <ArrowRight size={15} />
          </Link>
        </div>
        <Link
          href="/council"
          aria-label="Council workspace"
          title={collapsed ? "Council workspace" : undefined}
          aria-current={pathname.startsWith("/council") ? "page" : undefined}
          className={cn(
            "sidebar-link council-link",
            pathname.startsWith("/council") && "active",
          )}
        >
          <ShieldCheck size={17} />
          <span className="sidebar-label">Council workspace</span>
        </Link>
        <p className="sidebar-foot">PAYPAL AI HACKATHON · 2026</p>
      </aside>
      <div className="app-body">
        <header ref={topbar} className="app-topbar">
          <button
            className="sidebar-desktop-toggle"
            type="button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            aria-controls="workspace-sidebar"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <PanelLeftOpen size={19} />
            ) : (
              <PanelLeftClose size={19} />
            )}
          </button>
          <div className="mobile-brand">
            <Logo />
            <button
              aria-label={open ? "Close navigation" : "Open navigation"}
              aria-expanded={open}
              aria-controls="mobile-app-nav"
              className="icon-button"
              onClick={() => setOpen(!open)}
            >
              {open ? <X /> : <Menu />}
            </button>
          </div>
          <Link className="topbar-search" href="/bounties">
            <Search size={18} />
            <span>Find a cleanup quest</span>
            <ArrowUpRight size={15} />
          </Link>
          <div className="topbar-actions">
            <span className="workspace-location">
              <span className="location-dot" />
              Yamuna, Delhi
            </span>
            <ThemeToggle />
            <AuthMenu next={pathname} />
          </div>
        </header>
        {open && (
          <nav
            id="mobile-app-nav"
            aria-label="Mobile application navigation"
            className="mobile-app-nav"
          >
            {[
              ...links,
              {
                href: "/council",
                label: "Council workspace",
                icon: ShieldCheck,
              },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                aria-current={pathname.startsWith(href) ? "page" : undefined}
              >
                {label}
              </Link>
            ))}
          </nav>
        )}
        <WorkspacePage pathname={pathname} routes={routeOrder}>
          {children}
        </WorkspacePage>
        <footer className="app-footer">
          <span>RiverMind · PayPal AI Hackathon 2026 · Sandbox prototype</span>
          <Link href="/about">
            Built for transparent restoration <ArrowUpRight size={12} />
          </Link>
        </footer>
      </div>
    </div>
  );
}
