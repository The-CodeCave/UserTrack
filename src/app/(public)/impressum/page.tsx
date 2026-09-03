import type { Metadata } from "next";
import { LegalPage, Section } from "@/components/site/legal-page";
import { OPERATOR } from "@/lib/legal";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Impressum",
  description: `Anbieterkennzeichnung für UserTrack (usertrack.dev), betrieben von der ${OPERATOR.name}, Frechen.`,
  alternates: { canonical: `${SITE_URL}/impressum` },
};

const TOC: [string, string][] = [
  ["anbieter", "Anbieter"],
  ["vertretung", "Vertretung"],
  ["verantwortlich", "Inhaltlich verantwortlich"],
  ["streitbeilegung", "Streitbeilegung"],
  ["haftung-inhalte", "Haftung für Inhalte"],
  ["haftung-links", "Haftung für Links"],
  ["urheberrecht", "Urheberrecht"],
];

function Dict({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid border-t-2 border-pink">
      {rows.map(([k, v]) => (
        <div key={k} className="grid gap-1 border-b border-line py-3 sm:grid-cols-[180px_1fr] sm:gap-6">
          <dt className="font-mono text-[11px] uppercase tracking-wider">{k}</dt>
          <dd className="text-foreground">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function ImpressumPage() {
  return (
    <div lang="de">
      <LegalPage
        label="Impressum"
        title="Impressum"
        intro={<>Angaben gemäß § 5 DDG (vormals § 5 TMG) und § 18 Abs. 2 MStV für die {OPERATOR.name}, Frechen — Betreiberin von UserTrack (usertrack.dev). Die englische Fassung unter <a href="/imprint">/imprint</a> verweist hierher.</>}
        effective="Stand: Handelsregister · Frechen, NRW"
        toc={TOC}
      >
        <Section id="anbieter" title="01 — Anbieter">
          <Dict rows={[
            ["Anschrift", <>{OPERATOR.name}<br />{OPERATOR.street}<br />{OPERATOR.city}<br />{OPERATOR.region}<br />{OPERATOR.country}</>],
            ["E-Mail", <a key="m" href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>],
            ["Telefon", <a key="t" href={OPERATOR.phoneHref}>{OPERATOR.phone}</a>],
          ]} />
        </Section>

        <Section id="vertretung" title="02 — Vertretung">
          <Dict rows={[
            ["Geschäftsführer", <>{OPERATOR.directors[0]}<br />{OPERATOR.directors[1]}</>],
            ["Registergericht", OPERATOR.court],
            ["Handelsregister", OPERATOR.register],
            ["USt-IdNr.", <>{OPERATOR.vatId}<br /><span className="text-muted-foreground">Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG</span></>],
          ]} />
        </Section>

        <Section id="verantwortlich" title="03 — Inhaltlich verantwortlich">
          <Dict rows={[
            ["Verantwortlich i.S.d. § 18 Abs. 2 MStV", <>{OPERATOR.directors[0]}<br />{OPERATOR.directors[1]}<br />{OPERATOR.street}<br />{OPERATOR.city}</>],
          ]} />
          <p>Öffentliche Wachstumsseiten, Gründerprofile und Ranglisten auf UserTrack werden von den jeweiligen Gründerinnen und Gründern selbst angelegt und veröffentlicht. Die {OPERATOR.name} betreibt die Plattform; für die Richtigkeit fremder Angaben gelten die Hinweise unter „Haftung für Inhalte“.</p>
        </Section>

        <Section id="streitbeilegung" title="04 — Streitbeilegung">
          <p><strong>EU-Streitschlichtung.</strong> Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit: <a href={OPERATOR.odrUrl} rel="noopener noreferrer" target="_blank">{OPERATOR.odrUrl}</a>. Unsere E-Mail-Adresse finden Sie oben im Impressum.</p>
          <p><strong>Verbraucherstreitbeilegung.</strong> Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>
        </Section>

        <Section id="haftung-inhalte" title="05 — Haftung für Inhalte">
          <p>Als Diensteanbieter sind wir gemäß § 7 Abs. 1 DDG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 DDG sind wir als Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen.</p>
          <p>Verpflichtungen zur Entfernung oder Sperrung der Nutzung von Informationen nach den allgemeinen Gesetzen bleiben hiervon unberührt. Eine diesbezügliche Haftung ist jedoch erst ab dem Zeitpunkt der Kenntnis einer konkreten Rechtsverletzung möglich. Bei Bekanntwerden von entsprechenden Rechtsverletzungen werden wir diese Inhalte umgehend entfernen — Hinweise bitte an <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>.</p>
          <p>Nutzerkennzahlen, Gründerprofile und Produktbeschreibungen auf UserTrack stammen aus den von den Gründern verbundenen Datenquellen oder aus deren eigenen Angaben. Wir kennzeichnen die Verifizierungsstufe jeder Zahl (verifiziert · teilweise verifiziert · in Prüfung · selbst gemeldet), übernehmen aber keine Gewähr für Richtigkeit, Vollständigkeit oder Aktualität fremder Angaben.</p>
        </Section>

        <Section id="haftung-links" title="06 — Haftung für Links">
          <p>Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben — insbesondere die Websites, App-Store-Einträge und Social-Media-Profile der gelisteten Produkte und Gründer. Deshalb können wir für diese fremden Inhalte auch keine Gewähr übernehmen. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich.</p>
          <p>Die verlinkten Seiten wurden zum Zeitpunkt der Verlinkung auf mögliche Rechtsverstöße überprüft; rechtswidrige Inhalte waren zu diesem Zeitpunkt nicht erkennbar. Eine permanente inhaltliche Kontrolle der verlinkten Seiten ist ohne konkrete Anhaltspunkte einer Rechtsverletzung nicht zumutbar. Bei Bekanntwerden von Rechtsverletzungen werden wir derartige Links umgehend entfernen.</p>
        </Section>

        <Section id="urheberrecht" title="07 — Urheberrecht">
          <p>Die durch uns erstellten Inhalte und Werke auf diesen Seiten — Gestaltung, Texte, Grafiken, Software und die Methodik der Ranglisten — unterliegen dem deutschen Urheberrecht. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen der schriftlichen Zustimmung der {OPERATOR.name}.</p>
          <p>Öffentliche Wachstumsdaten (Nutzerzahlen, Wachstumsraten, Ranglisten) dürfen nach Maßgabe unserer <a href="/terms#licence">Nutzungsbedingungen</a> mit Quellenangabe „UserTrack“ weiterverwendet werden. Logos und Namen der gelisteten Produkte gehören den jeweiligen Rechteinhabern; sie werden nur zur Kennzeichnung des jeweiligen Produkts gezeigt und von den Gründern selbst hochgeladen. Sollten Sie trotzdem auf eine Urheberrechtsverletzung aufmerksam werden, bitten wir um einen entsprechenden Hinweis; bei Bekanntwerden von Rechtsverletzungen werden wir derartige Inhalte umgehend entfernen.</p>
        </Section>
      </LegalPage>
    </div>
  );
}
