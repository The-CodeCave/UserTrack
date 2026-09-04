import { LegalPage } from "../Shell";

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-line py-4 sm:grid-cols-[180px_1fr] sm:gap-6">
      <div className="text-label">{k}</div>
      <div className="text-foreground">{children}</div>
    </div>
  );
}

export default function Impressum() {
  return (
    <LegalPage label="// Impressum" title="Impressum">
      <p>Angaben gemäß § 5 DDG und § 18 Abs. 2 MStV für die The CodeCave GmbH, Frechen.</p>

      <h2>01 — Anbieter</h2>
      <div className="mt-4 border-t-2 border-pink">
        <Row k="Anschrift">The CodeCave GmbH<br />Alfred-Nobel-Str. 29<br />50226 Frechen<br />Nordrhein-Westfalen, Deutschland</Row>
        <Row k="E-Mail"><a href="mailto:info@thecodecave.de">info@thecodecave.de</a></Row>
        <Row k="Telefon"><a href="tel:+4915204943138">+49 152 04943138</a></Row>
      </div>

      <h2>02 — Vertretung</h2>
      <div className="mt-4 border-t-2 border-pink">
        <Row k="Geschäftsführer">Aleksandar Jovanovic<br />Tilman Kieselbach</Row>
        <Row k="Registergericht">Amtsgericht Bielefeld</Row>
        <Row k="Handelsregister">HRB 44492</Row>
        <Row k="USt-IdNr.">DE346809827</Row>
      </div>

      <h2>03 — Inhaltlich verantwortlich</h2>
      <div className="mt-4 border-t-2 border-pink">
        <Row k="Verantwortlich i.S.d. § 18 Abs. 2 MStV">Aleksandar Jovanovic, Tilman Kieselbach<br />Alfred-Nobel-Str. 29<br />50226 Frechen</Row>
      </div>

      <h2>04 — Streitbeilegung</h2>
      <p>
        Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:{" "}
        <a href="https://ec.europa.eu/consumers/odr/" rel="noopener noreferrer" target="_blank">https://ec.europa.eu/consumers/odr/</a>.
        Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.
      </p>

      <h2>05 — Haftung für Inhalte</h2>
      <p>
        Als Diensteanbieter sind wir gemäß § 7 Abs. 1 DDG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 DDG sind wir als Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen.
      </p>
      <p>
        Verpflichtungen zur Entfernung oder Sperrung der Nutzung von Informationen nach den allgemeinen Gesetzen bleiben hiervon unberührt. Eine diesbezügliche Haftung ist jedoch erst ab dem Zeitpunkt der Kenntnis einer konkreten Rechtsverletzung möglich. Bei Bekanntwerden von entsprechenden Rechtsverletzungen werden wir diese Inhalte umgehend entfernen.
      </p>

      <h2>06 — Haftung für Links</h2>
      <p>
        Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben. Deshalb können wir für diese fremden Inhalte auch keine Gewähr übernehmen. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich. Die verlinkten Seiten wurden zum Zeitpunkt der Verlinkung auf mögliche Rechtsverstöße überprüft. Rechtswidrige Inhalte waren zum Zeitpunkt der Verlinkung nicht erkennbar.
      </p>
      <p>
        Eine permanente inhaltliche Kontrolle der verlinkten Seiten ist jedoch ohne konkrete Anhaltspunkte einer Rechtsverletzung nicht zumutbar. Bei Bekanntwerden von Rechtsverletzungen werden wir derartige Links umgehend entfernen.
      </p>

      <h2>07 — Urheberrecht</h2>
      <p>
        Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen Urheberrecht. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen der schriftlichen Zustimmung des jeweiligen Autors bzw. Erstellers. Downloads und Kopien dieser Seite sind nur für den privaten, nicht kommerziellen Gebrauch gestattet.
      </p>
      <p>
        Soweit die Inhalte auf dieser Seite nicht vom Betreiber erstellt wurden, werden die Urheberrechte Dritter beachtet. Insbesondere werden Inhalte Dritter als solche gekennzeichnet. Sollten Sie trotzdem auf eine Urheberrechtsverletzung aufmerksam werden, bitten wir um einen entsprechenden Hinweis. Bei Bekanntwerden von Rechtsverletzungen werden wir derartige Inhalte umgehend entfernen.
      </p>
    </LegalPage>
  );
}
