import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import "./globals.css";
import "./dashboard.css";
import "./landing.css";
import "./reports.css";

export const metadata: Metadata = {
  title: { default: "RiverMind", template: "%s · RiverMind" },
  description:
    "A river with a voice. A cleanup with proof. RiverMind connects pollution detection, verified cleanups, and PayPal sandbox payments.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
