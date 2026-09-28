import type { Metadata, Viewport } from "next";
import { Suspense, type ReactNode } from "react";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import "./mobile.css";
import { AppStateProvider } from "@/components/shell/AppState";
import { BoardLiveProvider } from "@/components/board/BoardLive";
import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
import { ActivityPanel, BottomTabs, MobileDrawer } from "@/components/shell/Overlays";
import { ZoomLock } from "@/components/shell/ZoomLock";

export const metadata: Metadata = {
  title: "PROFESSOR-XMD — AI Engineering Company",
  description: "Five AI agents. One board room. Your project.",
  icons: { icon: "/favicon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#07080b",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <ZoomLock />
        <AppStateProvider>
          <BoardLiveProvider>
          <div aria-hidden className="backdrop-aurora pointer-events-none fixed inset-0" />
          <div className="relative flex min-h-dvh">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              {/* Topbar inatumia useSearchParams → inahitaji Suspense kwa `next build` */}
              <Suspense fallback={<div className="h-14 shrink-0" />}>
                <Topbar />
              </Suspense>
              <main className="flex min-h-0 flex-1 flex-col">{children}</main>
            </div>
          </div>
          <BottomTabs />
          <MobileDrawer />
          <ActivityPanel />
          </BoardLiveProvider>
        </AppStateProvider>
      </body>
    </html>
  );
}
