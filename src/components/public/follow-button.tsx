"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Bell, BellRing, Loader2 } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FollowButton({ targetType, targetId, count, size = "sm", className }: { targetType: "saas" | "profile"; targetId: string; count?: number; size?: "sm" | "default"; className?: string }) {
  const status = useQuery(api.follows.status, { targetType, targetId });
  const toggle = useMutation(api.follows.toggle);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const following = status?.following ?? false;
  async function onClick() {
    if (!status?.signedIn) {
      router.push(`/sign-in?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setBusy(true);
    try {
      const now = await toggle({ targetType, targetId });
      toast.success(now ? "Following — updates land in your weekly digest" : "Unfollowed");
    } catch (e) {
      toast.error((e as Error).message.replace(/^.*Uncaught Error: /, "").split("\n")[0]);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button size={size} variant={following ? "default" : "outline"} onClick={onClick} disabled={busy || status === undefined} className={cn("h-9", className)} aria-pressed={following}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : following ? <BellRing className="size-4" /> : <Bell className="size-4" />}
      {following ? "Following" : "Follow"}
      {count !== undefined && count > 0 && <span className="font-mono text-[11px] opacity-70">{count}</span>}
    </Button>
  );
}
