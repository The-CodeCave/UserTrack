"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "convex/react";
import { LayoutGrid, Boxes, Bell, Mail, UserRound, Code2, Settings, LogOut, Share2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { track } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/site/logo";
import { SiteFooter } from "@/components/site/footer";
import { Skeleton } from "@/components/ui/skeleton";

const NAV = [
  { href: "/app", label: "Overview", Icon: LayoutGrid },
  { href: "/app/saas", label: "My SaaS", Icon: Boxes },
  { href: "/app/share", label: "Share", Icon: Share2 },
  { href: "/app/following", label: "Following", Icon: Bell },
  { href: "/app/digest", label: "Digest", Icon: Mail },
  { href: "/app/profile", label: "Profile", Icon: UserRound },
  { href: "/app/developer", label: "Developer", Icon: Code2 },
  { href: "/app/settings", label: "Settings", Icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const me = useQuery(api.profiles.me);
  const pathname = usePathname();
  const router = useRouter();
  const onboarding = pathname.startsWith("/app/onboarding");

  useEffect(() => {
    if (me === undefined) return;
    if (me === null) router.replace("/sign-in");
    else if (!me.profile?.onboardingCompleted && !onboarding) router.replace("/app/onboarding");
  }, [me, onboarding, router]);

  if (me === undefined) return <ShellSkeleton />;
  if (onboarding) return <>{children}</>;
  if (!me?.profile?.onboardingCompleted) return <ShellSkeleton />;

  async function signOut() {
    track("sign_out");
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-line md:flex">
        <div className="flex h-14 items-center border-b border-line px-4"><Link href="/"><Logo /></Link></div>
        <nav className="flex flex-1 flex-col gap-0.5 p-2">
          {NAV.map(({ href, label, Icon }) => (
            <NavLink key={href} href={href} active={href === "/app" ? pathname === href : pathname.startsWith(href)}>
              <Icon className="size-4" />{label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line p-2">
          <div className="truncate px-3 py-1 font-mono text-[11px] text-muted-foreground">@{me.profile.username}</div>
          <button onClick={signOut} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
            <LogOut className="size-4" />Sign out
          </button>
        </div>
      </aside>

      <header className="flex h-14 items-center justify-between border-b border-line px-4 md:hidden">
        <Link href="/"><Logo /></Link>
        <button onClick={signOut} aria-label="Sign out" className="p-2 text-muted-foreground"><LogOut className="size-5" /></button>
      </header>

      <div className="flex flex-1 flex-col pb-20 md:pb-0">
        <main className="flex-1">{children}</main>
        <SiteFooter compact />
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-8 border-t border-line bg-background/90 backdrop-blur md:hidden">
        {NAV.map(({ href, label, Icon }) => {
          const active = href === "/app" ? pathname === href : pathname.startsWith(href);
          return (
            <Link key={href} href={href} className={cn("flex h-14 flex-col items-center justify-center gap-1 text-[9px] font-mono uppercase tracking-wider", active ? "text-pink" : "text-muted-foreground")}>
              <Icon className="size-5" />{label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 border-l-2 px-3 py-2 text-sm transition-colors",
        active ? "border-pink text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
