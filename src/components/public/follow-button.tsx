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
  const follow = useMutation(api.follows.follow);
  const unfollow = useMutation(api.follows.unfollow);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // Optimistic override until the status subscription catches up.
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const following = optimistic ?? status?.following ?? false;
  async function onClick() {
    if (!status?.signedIn) {
      router.push(`/sign-in?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    const next = !following;
    setOptimistic(next);
    setBusy(true);
    try {
      await (next ? follow({ targetType, targetId }) : unfollow({ targetType, targetId }));
      toast.success(next ? "Following — major milestones, rank moves and spikes show up in your feed" : "Unfollowed");
    } catch (e) {
      setOptimistic(null);
      toast.error((e as Error).message.replace(/^.*Uncaught Error: /, "").split("\n")[0]);
    } finally {
      setBusy(false);
      setOptimistic(null);
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
