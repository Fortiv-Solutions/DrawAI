import { Link } from "@tanstack/react-router";
import { useState, type ComponentType, ReactNode } from "react";
import { getCurrentUser } from "@/repositories";
import { QuickUploadDialog } from "@/components/QuickUploadDialog";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  FolderKanban,
  QrCode,
  Ruler,
  Settings,
  Upload,
  Menu,
  X,
} from "lucide-react";

const CURRENT_USER = getCurrentUser();

interface AppShellProps {
  children: ReactNode;
  projectId?: string;
  hideHeader?: boolean;
}

export function AppShell({ children, projectId, hideHeader }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background relative select-none">
      {!hideHeader && (
        <header className="sticky top-0 z-40 border-b border-border bg-card/85 text-foreground backdrop-blur-md supports-[backdrop-filter]:bg-card/75">
          <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center justify-between px-6 gap-3 sm:gap-4">
            
            {/* Brand Logo — left (icon-only on mobile, full text on sm+) */}
            <Link
              to="/dashboard"
              className="flex items-center gap-2 text-foreground cursor-pointer shrink-0"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950 text-white shadow-sm">
                <Ruler className="h-4.5 w-4.5" />
              </div>
              <span className="font-serif text-lg font-bold tracking-tight">
                Draw<span className="text-indigo-600">AI</span>
              </span>
            </Link>

            {/* Primary Nav — center (always visible, horizontally scrollable on mobile) */}
            <nav className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar scroll-smooth flex-1 justify-center max-w-[200px] xs:max-w-xs sm:max-w-md md:max-w-lg lg:max-w-xl py-1 px-1">
              <TopLink to="/dashboard" icon={<LayoutDashboard className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}>
                Dashboard
              </TopLink>
              <TopLink to="/projects" icon={<FolderKanban className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}>
                Projects
              </TopLink>
              {projectId ? (
                <>
                  <div className="mx-0.5 sm:mx-1 h-4 sm:h-5 w-px bg-border shrink-0" />
                  <TopLink
                    to="/projects/$projectId"
                    params={{ projectId }}
                    icon={<FolderKanban className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                  >
                    Register
                  </TopLink>
                  <TopLink
                    to="/handover/$projectId"
                    params={{ projectId }}
                    icon={<QrCode className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                  >
                    Handover
                  </TopLink>
                </>
              ) : null}
            </nav>

            {/* User & Actions — right */}
            <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
              <QuickUploadDialog
                defaultProjectId={projectId}
                trigger={
                  <Button
                    size="sm"
                    className="gap-1.5 bg-slate-950 text-white shadow-sm hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 font-bold text-xs h-9 px-3 sm:px-4 rounded-lg cursor-pointer"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Quick upload</span>
                  </Button>
                }
              />
              <div className="hidden items-center gap-3 rounded-full border border-border bg-slate-50/50 dark:bg-muted/10 px-2 py-1 pr-3 lg:flex select-none">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-950 text-white text-[10px] font-bold uppercase select-none">
                  {CURRENT_USER.name.charAt(0)}
                </div>
                <div className="min-w-0 leading-tight">
                  <div className="truncate text-xs font-semibold text-foreground">
                    {CURRENT_USER.name}
                  </div>
                  <div className="truncate text-[9px] font-bold uppercase tracking-wider text-muted-foreground/80">
                    {CURRENT_USER.role}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>
      )}

      <main className="flex-1">{children}</main>
    </div>
  );
}

function TopLink({
  to,
  params,
  icon,
  children,
}: {
  to: string;
  params?: Record<string, string>;
  icon: ReactNode;
  children: ReactNode;
}) {
  const LinkAny = Link as unknown as ComponentType<Record<string, unknown>>;
  const base =
    "inline-flex items-center gap-1 sm:gap-2 rounded-md px-1.5 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-sm font-medium text-muted-foreground transition hover:bg-muted/40 hover:text-foreground cursor-pointer shrink-0 whitespace-nowrap";
  return (
    <LinkAny
      to={to}
      params={params}
      className={base}
      activeProps={{
        className:
          "inline-flex items-center gap-1 sm:gap-2 rounded-md px-1.5 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-sm font-bold text-primary bg-muted/65 shrink-0 whitespace-nowrap",
      }}
    >
      {icon}
      {children}
    </LinkAny>
  );
}
