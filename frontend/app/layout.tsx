import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import "./globals.css";
import "./dashboard.css";
import "./landing.css";
import "./reports.css";
import "./overview.css";
import "./phone-workflow.css";
import "./report-document.css";
import "./workspace-polish.css";

export const metadata: Metadata = {
  title: { default: "RiverMind", template: "%s · RiverMind" },
  description:
    "RiverMind connects pollution detection, verified cleanups, and PayPal sandbox payments.",
  robots: { index: false, follow: false },
};

// Applies the saved (or system) theme before first paint, so light-mode
// visitors never see a flash of the dark default.
const themeScript = `(function(){try{var s=localStorage.getItem("rivermind:theme");var t=s==="light"||s==="dark"?s:(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");var r=document.documentElement;r.classList.toggle("dark",t==="dark");r.dataset.theme=t;}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
