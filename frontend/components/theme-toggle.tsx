"use client";

import { useEffect, useState } from "react";
import { AnimatedThemeToggler } from "./ui/animated-theme-toggler";

const STORAGE_KEY = "rivermind:theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const prefersLight = window.matchMedia(
      "(prefers-color-scheme: light)",
    ).matches;
    const next =
      saved === "light" || (!saved && prefersLight) ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.dataset.theme = next;
    window.setTimeout(() => setTheme(next), 0);
  }, []);

  return (
    <AnimatedThemeToggler
      className="theme-toggle"
      theme={theme}
      variant="diamond"
      duration={500}
      onThemeChange={(next) => {
        setTheme(next);
        document.documentElement.dataset.theme = next;
        window.localStorage.setItem(STORAGE_KEY, next);
      }}
      aria-label={
        theme === "light" ? "Switch to dark mode" : "Switch to light mode"
      }
      title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
    />
  );
}
