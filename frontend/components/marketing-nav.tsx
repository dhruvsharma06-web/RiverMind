"use client";
import Link from "next/link";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { useState } from "react";
import { Logo } from "./ui/shared";
import { Button } from "./ui/button";
import { ThemeToggle } from "./theme-toggle";
export function MarketingNav() {
  const [open, setOpen] = useState(false);
  return (
    <header
      className="experience-nav"
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <div className="experience-nav-inner">
        <Logo />
        <nav className="experience-nav-links" aria-label="Main navigation">
          <a href="#story">How it works</a>
          <a href="#expedition">Explore</a>
          <a href="#funding">Make an impact</a>
        </nav>
        <div className="experience-nav-actions">
          <ThemeToggle />
          <Button asChild variant="secondary" size="sm">
            <Link href="/river">
              Open workspace
              <ArrowUpRight size={14} />
            </Link>
          </Button>
          <button
            className="experience-menu-toggle"
            aria-label={open ? "Close navigation" : "Open navigation"}
            aria-expanded={open}
            aria-controls="marketing-mobile-nav"
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      {open && (
        <nav
          id="marketing-mobile-nav"
          className="experience-mobile-nav"
          aria-label="Mobile main navigation"
        >
          {[
            ["#story", "How it works"],
            ["#expedition", "Explore the workspace"],
            ["#funding", "Make an impact"],
          ].map(([href, label]) => (
            <a key={href} href={href} onClick={() => setOpen(false)}>
              {label}
            </a>
          ))}
          <Link href="/bounties" onClick={() => setOpen(false)}>
            Find a cleanup quest
          </Link>
          <Link href="/river" onClick={() => setOpen(false)}>
            Open workspace
          </Link>
        </nav>
      )}
    </header>
  );
}
