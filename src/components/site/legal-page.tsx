import type { ReactNode } from "react";
import { SectionLabel } from "@/components/blueprint/section-label";

// Long-form legal text: prose width, anchored h2 sections, readable muted body with foreground emphasis.
export function LegalPage({ label, title, intro, effective, toc, children }: { label: string; title: string; intro?: ReactNode; effective: string; toc: [string, string][]; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-prose px-4 py-8 sm:py-12">
      <SectionLabel>{label}</SectionLabel>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      {intro && <p className="mt-3 text-sm text-muted-foreground sm:text-base">{intro}</p>}
      <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{effective}</p>
      <nav aria-label="Sections" className="mt-6 border-y border-line py-3">
        <ol className="grid gap-x-4 gap-y-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground sm:grid-cols-2">
          {toc.map(([id, t], i) => <li key={id}><a href={`#${id}`} className="hover:text-foreground">{String(i + 1).padStart(2, "0")} — {t}</a></li>)}
        </ol>
      </nav>
      <div className="mt-8 space-y-10 text-sm leading-relaxed text-muted-foreground sm:text-[15px] [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a]:break-words [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5 [&_p+p]:mt-3 [&_h3]:mt-5 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:text-foreground [&_table]:w-full [&_table]:table-fixed sm:[&_table]:table-auto [&_table]:text-left [&_td]:break-words [&_th]:py-2 [&_th]:pr-3 [&_th]:align-top [&_th]:font-medium [&_th]:text-foreground [&_td]:border-t [&_td]:border-line [&_td]:py-2 [&_td]:pr-3 [&_td]:align-top">
        {children}
      </div>
    </div>
  );
}

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="mb-3 text-xl font-semibold tracking-tight text-foreground">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
