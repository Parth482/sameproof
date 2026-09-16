import type { Metadata } from "next";

import { AppHeader } from "@/components/shared/app-header";
import { ServiceWorkerRegistration } from "@/components/shared/service-worker-registration";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "SameProof — Explain the match", template: "%s | SameProof" },
  description: "Explainable monitor price-match feasibility with traceable identity, offer and policy evidence.",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-slate-50 text-slate-950">
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <div className="flex min-h-screen flex-col">
          <AppHeader />
          <div id="main-content" tabIndex={-1} className="flex flex-1 flex-col outline-none">{children}</div>
          <footer className="border-t border-slate-200 bg-white px-4 py-5 text-center text-xs leading-5 text-slate-500">
            SameProof provides explainable prototype guidance. Final approval remains with the retailer.
          </footer>
        </div>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
