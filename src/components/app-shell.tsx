import { Link } from "@tanstack/react-router";
import type { ComponentType, ReactNode } from "react";
import { getCurrentUser } from "@/repositories";
import { QuickUploadDialog } from "@/components/QuickUploadDialog";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  FolderKanban,
  AlertCircle,
  QrCode,
  
  Ruler,
  Settings,
  Upload,
} from "lucide-react";

const CURRENT_USER = getCurrentUser();

interface AppShellProps {
  children: ReactNode;
  projectId?: string;
}

export function AppShell({ children, projectId }: AppShellProps) {


  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-sidebar-border/60 bg-sidebar text-sidebar-foreground backdrop-blur supports-[backdrop-filter]:bg-sidebar/95">
        <div className="mx-auto grid h-16 w-full max-w-[1400px] grid-cols-[1fr_auto_1fr] items-center gap-6 px-6">
          {/* Brand — left */}
          <Link
            to="/dashboard"
            className="flex items-center gap-2.5 justify-self-start text-sidebar-foreground"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
              <Ruler className="h-4 w-4" />
            </div>
            <div className="font-display text-lg font-semibold tracking-tight">
              Draw<span className="text-sidebar-primary">AI</span>
            </div>
          </Link>

          {/* Primary nav — center */}
          <nav className="hidden items-center gap-1 justify-self-center md:flex">
            <TopLink to="/dashboard" icon={<LayoutDashboard className="h-4 w-4" />}>
              Dashboard
            </TopLink>
            <TopLink to="/projects" icon={<FolderKanban className="h-4 w-4" />}>
              Projects
            </TopLink>
            {projectId ? (
              <>
                <div className="mx-1 h-5 w-px bg-sidebar-border" />
                <TopLink
                  to="/projects/$projectId"
                  params={{ projectId }}
                  icon={<FolderKanban className="h-4 w-4" />}
                >
                  Register
                </TopLink>
                <TopLink
                  to="/projects/$projectId/issues"
                  params={{ projectId }}
                  icon={<AlertCircle className="h-4 w-4" />}
                >
                  Issues
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

          {/* User — right */}
          <div className="flex items-center gap-2 justify-self-end">
            <QuickUploadDialog
              defaultProjectId={projectId}
              trigger={
                <Button
                  size="sm"
                  className="gap-1.5 bg-sidebar-primary text-sidebar-primary-foreground shadow-sm hover:bg-sidebar-primary/90"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Quick upload</span>
                </Button>
              }
            />
            <div className="hidden items-center gap-3 rounded-full border border-sidebar-border bg-sidebar-accent px-2 py-1 pr-3 lg:flex">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
                {CURRENT_USER.name.charAt(0)}
              </div>
              <div className="min-w-0 leading-tight">
                <div className="truncate text-xs font-medium text-sidebar-foreground">
                  {CURRENT_USER.name}
                </div>
                <div className="truncate text-[10px] uppercase tracking-wider text-sidebar-foreground/55">
                  {CURRENT_USER.role}
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

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
    "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-sidebar-foreground/75 transition hover:bg-sidebar-accent hover:text-sidebar-foreground";
  return (
    <LinkAny
      to={to}
      params={params}
      className={base}
      activeProps={{
        className:
          "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-sidebar-primary bg-sidebar-accent",
      }}
    >
      {icon}
      {children}
    </LinkAny>
  );
}
