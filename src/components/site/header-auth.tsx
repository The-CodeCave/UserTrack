"use client";

import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

// Rendered on the client so the public page shell stays cacheable: reading the session on the server
// would opt every page under (public) out of ISR (docs/ARCHITECTURE.md → Public caching).
export function HeaderAuth() {
  const { data, isPending } = authClient.useSession();
  if (isPending) return <div aria-hidden className="h-8 w-[6.5rem] sm:w-[11rem]" />;
  if (data)
    return (
      <Button size="sm" render={<Link href="/app" />}>
        Dashboard
      </Button>
    );
  return (
    <>
      <Button variant="ghost" size="sm" className="hidden sm:inline-flex" render={<Link href="/sign-in" />}>Sign in</Button>
      <Button size="sm" render={<Link href="/sign-up" />}>Get started</Button>
    </>
  );
}
