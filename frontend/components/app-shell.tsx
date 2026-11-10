"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
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
import { ModeStatus, DemoNotice } from "./mode-status";
import { ThemeToggle } from "./theme-toggle";
import { AbstractArt } from "./abstract-art";
import { cn } from "@/lib/utils";
const links = [
  { href: "/river", label: "Observatory", icon: LayoutDashboard },
  { href: "/atlas", label: "River atlas", icon: Map },
  { href: "/bounties", label: "Cleanup quests", icon: Compass },
  { href: "/donate", label: "River treasury", icon: Heart },
  { href: "/reports", label: "Monthly reports", icon: FileChartColumn },
  { href: "/about", label: "How it works", icon: BookOpen },
];
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  return (
    <div className={cn("app-shell", collapsed && "sidebar-collapsed")}>
      <aside className="app-sidebar" id="workspace-sidebar">
        <Logo compact={collapsed} />
        <div className="sidebar-chapter">
          WORKSPACE<span>River care, made collective.</span>
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
          <AbstractArt variant="bloom" />
          <span className="sidebar-note-kicker">
            A LITTLE ACTION GOES A LONG WAY
          </span>
          <p>Your next good thing starts here.</p>
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
        <header className="app-topbar">
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
            <span>Find your next cleanup quest</span>
            <ArrowUpRight size={15} />
          </Link>
          <div className="topbar-actions">
            <span className="workspace-location">
              <span className="location-dot" />
              Yamuna, Delhi
            </span>
            <ThemeToggle />
            <ModeStatus />
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
        <DemoNotice />
        <main id="main-content" className="app-content">
          {children}
        </main>
        <footer className="app-footer">
          <span>RiverMind · Every action leaves a trace.</span>
          <Link href="/about">
            Built for transparent restoration <ArrowUpRight size={12} />
          </Link>
        </footer>
      </div>
    </div>
  );
}
