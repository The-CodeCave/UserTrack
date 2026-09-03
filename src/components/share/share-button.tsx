"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShareStudio, type StudioTarget } from "@/components/share/share-studio";
import { cn } from "@/lib/utils";

// The one Share affordance used everywhere: metric cards, charts, rank chips, milestones, founder pages.
export function ShareButton({ target, variant = "icon", className, children }: { target: StudioTarget; variant?: "icon" | "button" | "chip"; className?: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === "icon" ? (
        <button type="button" onClick={() => setOpen(true)} aria-label={`Share ${target.label}`} title="Share as card" className={cn("grid size-8 place-items-center text-muted-foreground transition-colors hover:text-pink", className)}>
          <Share2 className="size-4" />
        </button>
      ) : variant === "chip" ? (
        <button type="button" onClick={() => setOpen(true)} className={cn("inline-flex min-h-[32px] items-center gap-1.5 border border-line px-2.5 text-xs transition-colors hover:border-pink hover:text-pink", className)}>
          <Share2 className="size-3.5" /> {children ?? "Share"}
        </button>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)} className={cn("h-9", className)}>
          <Share2 className="size-4" /> {children ?? "Share"}
        </Button>
      )}
      {open && <ShareStudio target={target} open={open} onOpenChange={setOpen} />}
    </>
  );
}
