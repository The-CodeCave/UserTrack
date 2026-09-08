import type { Metadata } from "next";
import { PreviewResult } from "@/components/public/preview-result";

// Never indexed and never cached: the result belongs to the one visitor who typed the address, and it is read
// client-side from sessionStorage so there is no shareable URL carrying somebody else's domain.
export const metadata: Metadata = { title: "Your page, before you sign up", robots: { index: false, follow: true } };

export default function PreviewPage() {
  return (
    <div className="relative">
      <div aria-hidden className="bp-grid bp-grid-fade absolute inset-0 -z-10" />
      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <PreviewResult />
      </div>
    </div>
  );
}
