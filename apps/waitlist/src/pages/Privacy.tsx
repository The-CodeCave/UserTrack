import { LegalPage } from "../Shell";

const EFFECTIVE = "4 September 2026";

export default function Privacy() {
  return (
    <LegalPage label="// Privacy Policy" title="Privacy Policy">
      <p>Effective date: {EFFECTIVE}. This policy covers the UserTrack waitlist page at usertrack.dev.</p>

      <div className="mt-8 border border-line bg-card p-5">
        <div className="text-label">Datenschutzhinweis (DE) — Kurzfassung</div>
        <p><strong>Verantwortlicher:</strong> The CodeCave GmbH, Alfred-Nobel-Str. 29, 50226 Frechen, Deutschland · <a href="mailto:info@thecodecave.de">info@thecodecave.de</a> · +49 152 04943138.</p>
        <p><strong>Zweck &amp; Rechtsgrundlage:</strong> Ihre E-Mail-Adresse wird ausschließlich gespeichert, um Sie einmalig über den Start von UserTrack zu informieren (Art. 6 Abs. 1 lit. a DSGVO — Einwilligung). Sie können die Einwilligung jederzeit per E-Mail an info@thecodecave.de widerrufen; wir löschen den Eintrag dann.</p>
        <p><strong>Ihre Rechte:</strong> Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit, Widerspruch (Art. 15–21 DSGVO) sowie Beschwerde bei der Landesbeauftragten für Datenschutz und Informationsfreiheit Nordrhein-Westfalen (LDI NRW). Die vollständige Fassung folgt auf Englisch.</p>
      </div>

      <h2>1. Controller</h2>
      <p>The CodeCave GmbH, Alfred-Nobel-Str. 29, 50226 Frechen, Germany. Email: <a href="mailto:info@thecodecave.de">info@thecodecave.de</a>, phone: +49 152 04943138. Represented by the managing directors Aleksandar Jovanovic and Tilman Kieselbach.</p>

      <h2>2. What we process when you join the waitlist</h2>
      <ul>
        <li>The email address you submit (trimmed and lower-cased).</li>
        <li>The timestamp of your signup and of your consent.</li>
        <li>Optionally the <code>utm_source</code> parameter of the link you arrived from, if present.</li>
        <li>Optionally the hostname of the referring website (e.g. "x.com"), never the full URL.</li>
        <li>A coarse device type ("mobile" or "desktop"). We do not store IP addresses or full user-agent strings.</li>
      </ul>

      <h2>3. Purpose and legal basis</h2>
      <p>We use this data to notify you once when UserTrack launches and, if you keep the subscription afterwards, to send occasional product updates. The legal basis is your consent under Art. 6(1)(a) GDPR, given by submitting the form. You can withdraw consent at any time by emailing <a href="mailto:info@thecodecave.de">info@thecodecave.de</a>; we then delete your entry. Withdrawal does not affect the lawfulness of processing before withdrawal.</p>
      <p>The UTM source, referrer hostname and device type are used in aggregate to understand which channels bring people to the waitlist (legitimate interest, Art. 6(1)(f) GDPR). They cannot be used to identify you beyond the email you gave us.</p>

      <h2>4. Storage and processors</h2>
      <p><strong>Database:</strong> waitlist entries are stored with Convex, Inc. (San Francisco, USA). Transfers to the USA are safeguarded by the EU Standard Contractual Clauses included in Convex's data processing agreement.</p>
      <p><strong>Hosting:</strong> this page is served by Railway Corp. (San Francisco, USA) under Standard Contractual Clauses. Railway processes connection data (such as your IP address) transiently to deliver the page; we do not receive or store it.</p>
      <p><strong>Retention:</strong> entries are deleted at the latest 12 months after the UserTrack launch, or immediately when you withdraw consent — whichever comes first.</p>

      <h2>5. Analytics — no cookies</h2>
      <p>We measure page views and waitlist signups with Rybbit, an open-source analytics tool that we self-host on EU infrastructure operated by The CodeCave GmbH. Rybbit is cookieless: it sets no cookies, stores no IP addresses and creates no persistent identifiers, so no consent banner is required (§ 25(2) TDDDG, Art. 6(1)(f) GDPR). The events we record are "page view", "waitlist_join" and "waitlist_join_failed" — none of them contain your email address.</p>
      <p>This site uses no cookies and no local storage at all.</p>

      <h2>6. Your rights</h2>
      <p>Under Art. 15–21 GDPR you have the right to access, rectify and erase your data, to restrict or object to its processing, and to data portability. To exercise any of these rights email <a href="mailto:info@thecodecave.de">info@thecodecave.de</a>. You also have the right to lodge a complaint with a supervisory authority; the authority responsible for us is the Landesbeauftragte für Datenschutz und Informationsfreiheit Nordrhein-Westfalen (LDI NRW), Kavalleriestraße 2–4, 40213 Düsseldorf, <a href="https://www.ldi.nrw.de" rel="noopener noreferrer" target="_blank">www.ldi.nrw.de</a>.</p>

      <h2>7. Children</h2>
      <p>The waitlist is intended for people aged 16 or older. If you are younger, please do not submit your email address. If we learn that we hold data of a child under 16 without valid consent, we delete it.</p>

      <h2>8. Changes</h2>
      <p>We will update this policy when UserTrack launches and the full product replaces this page. The effective date at the top always reflects the current version.</p>
    </LegalPage>
  );
}
