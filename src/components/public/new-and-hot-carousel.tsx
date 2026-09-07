import { SectionLabel } from "@/components/blueprint/section-label";
import { MiniSaasCard, type SaasRow } from "@/components/public/saas-card";

// Hidden entirely when there is nothing new/rising to show — no empty-state placeholder.
export function NewAndHotCarousel({ items }: { items: SaasRow[] }) {
  if (items.length === 0) return null;
  return (
    <section className="border-t border-line">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <SectionLabel>New & hot</SectionLabel>
        <div className="-mx-4 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
          {items.map((s) => (
            <div key={s._id} className="w-[min(21rem,82vw)] shrink-0 snap-start">
              <MiniSaasCard s={s} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
