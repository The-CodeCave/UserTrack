import Image from "next/image";
import { cn } from "@/lib/utils";

// Brand assets live in public/brand (generated from brand/*.png). Wordmark is 1200×426.
export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return compact ? (
    <Image src="/brand/monogram.png" alt="UserTrack" width={28} height={28} className={cn("size-7", className)} priority />
  ) : (
    <Image src="/brand/wordmark.png" alt="UserTrack" width={124} height={44} className={cn("h-7 w-auto", className)} priority />
  );
}
