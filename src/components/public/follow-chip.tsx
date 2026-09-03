"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Bell, BellRing, Loader2 } from "lucide-react";
import { api } from "@convex/_generated/api";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";

// Icon-only follow toggle for cards and rows. One `follows.ids` subscription serves every chip on the page.
// Render it as a sibling of the card's <Link>, never inside it.
export function FollowChip({ targetType, targetId, className }: { targetType: "saas" | "profile"; targetId: string; className?: string }) {
  const ids = useQuery(api.follows.ids, {});
  const follow = useMutation(api.follows.follow);
  const unfollow = useMutation(api.follows.unfollow);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const following = ids ? (targetType === "saas" ? ids.saas : ids.profiles).includes(targetId) : false;
  async function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!ids?.signedIn) {
      router.push(`/sign-in?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    setBusy(true);
    try {
      await (following ? unfollow({ targetType, targetId }) : follow({ targetType, targetId }));
      track(following ? "unfollow" : "follow", { targetType });
      toast.success(following ? "Unfollowed" : "Following — rank moves, spikes and milestones show up in your feed");
    } catch (err) {
      toast.error((err as Error).message.replace(/^.*Uncaught Error: /, "").split("\n")[0]);
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={following}
      aria-label={following ? "Unfollow" : "Follow"}
      title={following ? "Following" : "Follow"}
      className={cn("grid size-7 place-items-center border border-line bg-background text-muted-foreground transition-colors hover:border-pink hover:text-pink", following && "border-pink/60 text-pink", className)}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : following ? <BellRing className="size-3.5" /> : <Bell className="size-3.5" />}
    </button>
  );
}
