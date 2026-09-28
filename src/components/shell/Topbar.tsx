"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useBoardLive } from "../board/BoardLive";
import { Menu, ChevronRight, PanelRight } from "lucide-react";
import { getAgent } from "@/lib/team";
import { LogoMark } from "../ui/Logo";
import { useApp } from "./AppState";
import { NewSessionButton } from "./Sidebar";

function crumbs(pathname: string): { label: string; href?: string }[] {
  if (pathname === "/") return [{ label: "Overview" }];
  const parts = pathname.split("/").filter(Boolean);
  const map: Record<string, string> = { board: "Board Room", agents: "Agents", reports: "Reports", sessions: "Sessions" };
  const out: { label: string; href?: string }[] = [{ label: map[parts[0]] ?? parts[0], href: parts.length > 1 ? `/${parts[0]}` : undefined }];
  if (parts[1]) out.push({ label: getAgent(parts[1])?.name ?? parts[1] });
  return out;
}

export function Topbar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const board = useBoardLive();
  const isBoardSession =
    pathname === "/board" &&
    (board.mode !== "idle" || searchParams.has("prompt") || searchParams.has("session"));
  const { setMobileNavOpen} = useApp();
  const c = crumbs(pathname);
  return (
    <header className="glass sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-x-0 border-t-0 px-3 sm:px-5">
      <button onClick={() => setMobileNavOpen(true)} aria-label="Open menu" className="grid h-9 w-9 place-items-center rounded-xl text-[var(--color-muted)] hover:bg-white/5 lg:hidden">
        <Menu size={18} />
      </button>
      <nav className="flex min-w-0 flex-1 items-center">
        {pathname === "/" ? (
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              className="shrink-0"
              aria-label="PROFESSOR-XMD-COMPANY"
            >
              <LogoMark size={36} />
            </Link>

            <div className="min-w-0 leading-none">
              <div className="truncate text-[15px] font-semibold tracking-tight text-[var(--color-fg)] sm:text-[16px]">
                PROFESSOR-XMD-COMPANY
              </div>

              <div className="mt-1 truncate text-[10.5px] font-medium tracking-wide text-[var(--color-faint)] sm:text-[11px]">
                Overview
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-1.5 text-[13px]">
            <span className="hidden text-[var(--color-faint)] sm:inline">Workspace</span>

            {c.map((x, i) => (
              <span key={i} className="flex min-w-0 items-center gap-1.5">
                <ChevronRight
                  size={13}
                  className={
                    i === 0
                      ? "hidden text-[var(--color-faint)] sm:block"
                      : "text-[var(--color-faint)]"
                  }
                />

                {x.href ? (
                  <Link
                    href={x.href}
                    className="truncate text-[var(--color-muted)] hover:text-[var(--color-fg)]"
                  >
                    {x.label}
                  </Link>
                ) : (
                  <span className="truncate font-medium text-[var(--color-fg)]">
                    {x.label}
                  </span>
                )}
              </span>
            ))}
          </div>
        )}
      </nav>

      
      {isBoardSession && (
        <button
          onClick={() =>
            window.dispatchEvent(new Event("xmd:open-session-details"))
          }
          className="btn-ghost grid h-9 w-9 place-items-center rounded-xl"
          aria-label="Session details"
          title="Session details"
        >
          <PanelRight size={15} />
        </button>
      )}

      <div className="hidden sm:block"><NewSessionButton /></div>
    </header>
  );
}
