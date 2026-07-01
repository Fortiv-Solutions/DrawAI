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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-background relative">
      {!hideHeader && (
        <header className="sticky top-0 z-40 border-b border-border bg-card/85 text-foreground backdrop-blur-md supports-[backdrop-filter]:bg-card/75">
          <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center justify-between px-6 gap-4">
            
            {/* Brand & Mobile menu button — left */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0 md:hidden cursor-pointer"
                onClick={() => setMobileMenuOpen(prev => !prev)}
                title="Toggle menu"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
              
              <Link
                to="/dashboard"
                className="flex items-center gap-2.5 text-foreground"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950 text-white shadow-sm">
                  <Ruler className="h-4.5 w-4.5" />
                </div>
                <div className="font-serif text-lg font-bold tracking-tight">
                  Draw<span className="text-indigo-600">AI</span>
                </div>
              </Link>
            </div>

            {/* Primary nav — center (always visible on desktop) */}
            <nav className="hidden items-center gap-1.5 md:flex">
              <TopLink to="/dashboard" icon={<LayoutDashboard className="h-4 w-4" />}>
                Dashboard
              </TopLink>
              <TopLink to="/projects" icon={<FolderKanban className="h-4 w-4" />}>
                Projects
              </TopLink>
              {projectId ? (
                <>
                  <div className="mx-1 h-5 w-px bg-border" />
                  <TopLink
                    to="/projects/$projectId"
                    params={{ projectId }}
                    icon={<FolderKanban className="h-4 w-4" />}
                  >
                    Register
                  </TopLink>
                  <TopLink
                    to="/handover/$projectId"
                    params={{ projectId }}
                    icon={<QrCode className="h-4 w-4" />}
                  >
                    Handover
                  </TopLink>
                  <TopLink
                    to="/projects/$projectId/settings"
                    params={{ projectId }}
                    icon={<Settings className="h-4 w-4" />}
                  >
                    Settings
                  </TopLink>
                </>
              ) : null}
            </nav>

            {/* User & Actions — right */}
            <div className="flex items-center gap-2.5">
              <QuickUploadDialog
                defaultProjectId={projectId}
                trigger={
                  <Button
                    size="sm"
                    className="gap-1.5 bg-slate-950 text-white shadow-sm hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 font-bold text-xs h-9 px-4 rounded-lg cursor-pointer"
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

      {/* Mobile Drawer Navigation Menu */}
      {mobileMenuOpen && !hideHeader && (
        <div className="fixed inset-x-0 top-16 bottom-0 z-40 bg-background/95 backdrop-blur-md md:hidden border-t border-border flex flex-col p-6 animate-in fade-in slide-in-from-top-4 duration-200">
          <nav className="flex flex-col gap-3">
            <MobileLink to="/dashboard" icon={<LayoutDashboard className="h-5 w-5" />} onClick={() => setMobileMenuOpen(false)}>
              Dashboard
            </MobileLink>
            <MobileLink to="/projects" icon={<FolderKanban className="h-5 w-5" />} onClick={() => setMobileMenuOpen(false)}>
              Projects
            </MobileLink>
            {projectId ? (
              <>
                <div className="my-2 h-px bg-border" />
                <MobileLink
                  to="/projects/$projectId"
                  params={{ projectId }}
                  icon={<FolderKanban className="h-5 w-5" />}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Register
                </MobileLink>
                <MobileLink
                  to="/handover/$projectId"
                  params={{ projectId }}
                  icon={<QrCode className="h-5 w-5" />}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Handover
                </MobileLink>
                <MobileLink
                  to="/projects/$projectId/settings"
                  params={{ projectId }}
                  icon={<Settings className="h-5 w-5" />}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Settings
                </MobileLink>
              </>
            ) : null}
          </nav>
        </div>
      )}

      <main className="flex-1">{children}</main>
    </div>
  );
}

function MobileLink({
  to,
  params,
  icon,
  children,
  onClick,
}: {
  to: string;
  params?: Record<string, string>;
  icon: ReactNode;
  children: ReactNode;
  onClick?: () => void;
}) {
  const LinkAny = Link as unknown as ComponentType<Record<string, unknown>>;
  const base =
    "inline-flex items-center gap-3.5 rounded-lg px-4 py-3 text-base font-semibold text-muted-foreground transition hover:bg-muted/50 hover:text-foreground cursor-pointer w-full";
  return (
    <LinkAny
      to={to}
      params={params}
      onClick={onClick}
      className={base}
      activeProps={{
        className:
          "inline-flex items-center gap-3.5 rounded-lg px-4 py-3 text-base font-bold text-primary bg-muted/80 w-full",
      }}
    >
      {icon}
      {children}
    </LinkAny>
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
    "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-muted/40 hover:text-foreground cursor-pointer";
  return (
    <LinkAny
      to={to}
      params={params}
      className={base}
      activeProps={{
        className:
          "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-bold text-primary bg-muted/65",
      }}
    >
      {icon}
      {children}
    </LinkAny>
  );
}
