import type { Metadata } from "next";
import { LegalPage, Section } from "@/components/site/legal-page";
import { EFFECTIVE_DATE, OPERATOR, RETENTION_DAYS, SUPERVISORY_AUTHORITY } from "@/lib/legal";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy / Datenschutzerklärung",
  description: "How UserTrack processes personal data: controller, data categories, purposes and legal bases, processors, retention, your GDPR rights, cookies and cookieless analytics.",
  alternates: { canonical: `${SITE_URL}/privacy` },
};

const TOC: [string, string][] = [
  ["controller", "Controller"],
  ["overview", "What UserTrack is"],
  ["data", "Data we process"],
  ["purposes", "Purposes and legal bases"],
  ["recipients", "Processors and third countries"],
  ["retention", "Retention"],
  ["cookies", "Cookies"],
  ["analytics", "Analytics"],
  ["public", "Public by design"],
  ["rights", "Your rights"],
  ["self-service", "Deletion and export"],
  ["children", "Children"],
  ["security", "Security"],
  ["changes", "Changes"],
];

const R = RETENTION_DAYS;

export default function PrivacyPage() {
  return (
    <LegalPage
      label="Legal"
      title="Privacy Policy / Datenschutzerklärung"
      intro={<>This policy explains which personal data UserTrack (usertrack.dev) processes, why, on which legal basis, and what you can do about it. The German summary below is binding for the identity of the controller and your rights; the English text is the full policy.</>}
      effective={`Effective date: ${EFFECTIVE_DATE}`}
      toc={TOC}
    >
      <section lang="de" className="border border-line bg-card/80 p-4 sm:p-5">
        <h2 className="mb-3 text-base font-semibold tracking-tight text-foreground">Kurzfassung auf Deutsch</h2>
        <p><strong>Verantwortlicher:</strong> {OPERATOR.name}, {OPERATOR.street}, {OPERATOR.city}, {OPERATOR.country}, vertreten durch die Geschäftsführer {OPERATOR.directors.join(" und ")}. <strong>Kontakt:</strong> <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>, {OPERATOR.phone}. Ein Datenschutzbeauftragter ist nicht bestellt, da keine gesetzliche Pflicht besteht.</p>
        <p><strong>Betroffenenrechte:</strong> Sie haben das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21), sowie das Recht, eine erteilte Einwilligung jederzeit mit Wirkung für die Zukunft zu widerrufen (Art. 7 Abs. 3). Konto löschen und Daten exportieren können Sie selbst unter <a href="/app/settings#data-privacy">/app/settings#data-privacy</a>; alle anderen Anfragen richten Sie an {OPERATOR.email}. Beschwerden nehmen die {SUPERVISORY_AUTHORITY.name} ({SUPERVISORY_AUTHORITY.address}) oder jede andere Aufsichtsbehörde entgegen.</p>
        <p><strong>Cookies und Analyse:</strong> UserTrack setzt nur das technisch notwendige Sitzungs-Cookie des Logins und nutzt eine selbst betriebene, cookielose Reichweitenmessung ohne Tracking über Websites hinweg. Ein Einwilligungsbanner ist deshalb nicht erforderlich.</p>
      </section>

      <Section id="controller" title="1. Controller">
        <p>The controller within the meaning of Art. 4(7) GDPR is <strong>{OPERATOR.name}</strong>, {OPERATOR.street}, {OPERATOR.city}, {OPERATOR.region}, Germany, represented by its managing directors {OPERATOR.directors.join(" and ")}. Register: {OPERATOR.court}, {OPERATOR.register}. Contact: <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>, <a href={OPERATOR.phoneHref}>{OPERATOR.phone}</a>. See the <a href="/impressum">Impressum</a>. No data protection officer has been appointed because none is legally required.</p>
      </Section>

      <Section id="overview" title="2. What UserTrack is">
        <p>UserTrack is a free, public leaderboard of SaaS and app <strong>user growth</strong>. Founders connect a data source they own (an authentication provider, a read-only database role, an analytics tool, a billing tool for conversion counts, or our SDK), UserTrack reads <strong>aggregate counts only</strong> — never revenue, never customer lists — and publishes a growth page, rankings, share cards, embeds, a JSON API and an MCP server for AI agents.</p>
        <p>Two groups of people are affected: <strong>founders</strong> with an account, and <strong>visitors</strong> who browse public pages, call the API or view an embed. Founders should note that the end users of their own products are <strong>not</strong> identified to UserTrack: we receive counts and, where a founder enables cohort matching, salted hashes of internal ids (section 3.4).</p>
      </Section>

      <Section id="data" title="3. Data we process">
        <h3>3.1 Account</h3>
        <p>Managed by the Better Auth library inside our database: email address, display name, password hash (never the password), email-verification status, session tokens, sign-up and sign-in timestamps. If you use one of the <strong>sign-in providers we offer</strong> (currently Google; GitHub and X may be added), we receive the provider’s user id, your name, email and avatar URL from that provider and store the provider id to recognise you next time. We never receive your provider password.</p>
        <h3>3.2 Founder profile</h3>
        <p>Username, display name, avatar URL, bio, website, GitHub, LinkedIn and X handle, location, notification preferences, follower count and the profile-visibility settings you choose. Everything except email and settings is <strong>published by design</strong> on your founder page unless you switch the profile to private, anonymous or hidden (section 9).</p>
        <h3>3.3 Products and connected sources</h3>
        <p>Product name, slug, URLs, category, description, logo, platform type, founding month and visibility toggles. To sync a source we store the <strong>credentials you provide</strong> (API keys, read-only database connection strings, service-role keys, OAuth tokens where a provider uses them). They are stored server-side in our database, used <strong>read-only</strong> by the sync jobs, and are never returned to the dashboard, the API or an agent. We also log each sync run (status, error message, duration, row counts) so you can see why a source stopped working.</p>
        <h3>3.4 Growth data</h3>
        <p>Per product and per stage (reached, signed up, activated, trial, converted): totals and daily counts, snapshots every four hours, ranking and benchmark positions, milestones and computed trust scores. For <strong>cohort matching</strong> a source may report internal user ids; each id is hashed as <code className="font-mono text-foreground">SHA-256(IDENTITY_SALT · project · id)</code> inside the sync job before it is stored. Anything that looks like an email address is dropped at parse time. The salt is a server secret, so the hashes cannot be reversed or linked across projects, and nothing on UserTrack ever displays an individual subject — only counts and medians per signup month.</p>
        <h3>3.5 Email</h3>
        <p>Your email preferences and a delivery log per message: recipient address, message type (welcome, verification, password reset, milestone, digest, monthly report …), status, timestamps, the provider’s message id and the template variables used. Bounce and complaint signals from our email provider are stored per address to suppress further mail. Message bodies and any authentication links are not kept in the log.</p>
        <h3>3.6 Developer tokens, API usage and audit log</h3>
        <p>API keys and MCP tokens are stored <strong>hashed</strong> (SHA-256) together with a name, prefix, scopes, creation, expiry, revocation and last-use timestamps. Usage is counted per token, day and endpoint category. Writes performed with a token and onboarding steps are recorded in an audit log (action, project, success, short detail — never configs or secrets).</p>
        <h3>3.7 Webhooks</h3>
        <p>Endpoint URL, description, subscribed events, signing secret (shown once, then kept server-side), delivery attempts with HTTP status, timing and error text. Response bodies are not stored.</p>
        <h3>3.8 Embeds, follows and share cards</h3>
        <p>When a badge or widget is loaded from another site we record the <strong>referring host name only</strong> (no path, no visitor data) to show “embedded on N sites”. Follows link your profile to the products and founders you follow. Share and card views are counted per product and card type without identifying the viewer.</p>
        <h3>3.9 Connected X account (optional)</h3>
        <p>If you connect X, we store the X user id, handle, name, avatar URL, the access and refresh tokens with their scopes, the connection status, the last post made and, if you enable auto-posting, the posts published on your behalf. Tokens are used only to post what you opted in to and to refresh the handle and avatar.</p>
        <h3>3.10 Server logs and abuse prevention</h3>
        <p>Our hosting providers keep request logs (IP address, user agent, requested URL, response status, timestamp) for a short period for security and debugging. Anonymous API, badge, embed and card requests are rate-limited per IP address; the counters live for at most ten minutes. We do not build visitor profiles from these logs.</p>
        <h3>3.11 Analytics</h3>
        <p>Cookieless page-view statistics as described in section 8. No account data is sent to the analytics service.</p>
      </Section>

      <Section id="purposes" title="4. Purposes and legal bases">
        <table>
          <thead><tr><th>Purpose</th><th>Data</th><th>Legal basis</th></tr></thead>
          <tbody>
            <tr><td>Providing the account, the dashboard, syncs, public growth pages, API, MCP, webhooks, embeds and transactional email (welcome, verification, password reset, sync failures)</td><td>3.1 – 3.4, 3.6 – 3.8, transactional part of 3.5</td><td>Art. 6(1)(b) GDPR — performance of the contract described in the <a href="/terms">Terms</a></td></tr>
            <tr><td>Security, abuse and fraud prevention (rate limiting, trust scores, audit log, email-verification, bounce suppression), debugging</td><td>3.6, 3.10, sync logs, trust signals</td><td>Art. 6(1)(f) GDPR — our legitimate interest in a reliable, un-gamed leaderboard and a secure service</td></tr>
            <tr><td>Cookieless reach measurement</td><td>3.11</td><td>Art. 6(1)(f) GDPR — legitimate interest in understanding which pages are used; no cookies or device fingerprints, so § 25 TDDDG consent is not required</td></tr>
            <tr><td>Product nudges, growth emails, weekly digest, monthly report, followed-product alerts</td><td>3.5 (non-transactional)</td><td>Art. 6(1)(a) GDPR — consent via the notification preferences; withdraw any time at <a href="/app/settings/notifications">/app/settings/notifications</a> or the unsubscribe link</td></tr>
            <tr><td>Posting to your X account, importing handle and avatar from X</td><td>3.9</td><td>Art. 6(1)(a) GDPR — consent when you connect X and enable a posting category; disconnect at any time</td></tr>
            <tr><td>Publishing founder profile and growth data</td><td>3.2 – 3.4 (public projections only)</td><td>Art. 6(1)(b) GDPR — publication is the core of the service you request; visibility controls in section 9</td></tr>
          </tbody>
        </table>
      </Section>

      <Section id="recipients" title="5. Processors and third countries">
        <p>We use the following processors under Art. 28 GDPR contracts. Where a processor is located in the United States, transfers rely on the EU Standard Contractual Clauses (Art. 46(2)(c) GDPR) and, where the provider is certified, on the EU-US Data Privacy Framework.</p>
        <table>
          <thead><tr><th>Provider</th><th>Role</th><th>Location / safeguard</th></tr></thead>
          <tbody>
            <tr><td>Convex, Inc.</td><td>Database, backend functions, authentication storage, scheduled jobs</td><td>USA — SCCs</td></tr>
            <tr><td>Railway Corp.</td><td>Hosting of the web application (request logs)</td><td>USA — SCCs; EU region where available</td></tr>
            <tr><td>Resend, Inc.</td><td>Transactional and notification email delivery</td><td>USA — SCCs</td></tr>
            <tr><td>Cloudflare, Inc.</td><td>DNS, CDN and DDoS protection in front of usertrack.dev</td><td>Global edge, EU data localisation — SCCs</td></tr>
            <tr><td>Google LLC</td><td>Sign in with Google (only when you choose it)</td><td>USA — SCCs / DPF; Google acts as independent controller for its own account data</td></tr>
            <tr><td>GitHub, Inc. · X Corp.</td><td>Sign-in providers we may offer; X additionally for the optional account connection and posting</td><td>USA — SCCs; independent controllers for their platforms</td></tr>
            <tr><td>The CodeCave GmbH (self-hosted Rybbit)</td><td>Cookieless web analytics operated by us on EU infrastructure</td><td>EU — no third-party access</td></tr>
          </tbody>
        </table>
        <p>Your connected data sources (Clerk, Supabase, Firebase, Auth0, PostgreSQL, PostHog, Plausible, GA4, Stripe, RevenueCat, Paddle, Lemon Squeezy, Chargebee, your own endpoint) are <strong>your</strong> processors or controllers; UserTrack only reads from them with the credentials you provide. We do not sell data and do not share it with advertisers.</p>
      </Section>

      <Section id="retention" title="6. Retention">
        <ul>
          <li><strong>Account, profile, products, connected-source configuration, growth aggregates, follows, tokens:</strong> until you delete them or your account.</li>
          <li><strong>Raw 4-hour snapshots:</strong> aggregated into daily rows after {R.snapshotsRawBeforeAggregation} days; daily rows are kept as the product’s history.</li>
          <li><strong>Sync runs:</strong> {R.syncRuns} days.</li>
          <li><strong>Webhook deliveries:</strong> {R.webhookDeliveries} days.</li>
          <li><strong>API usage counters:</strong> {R.apiUsage} days.</li>
          <li><strong>Email delivery log:</strong> {R.emailLog} days; bounce and complaint suppression until you ask us to lift it.</li>
          <li><strong>Audit log:</strong> {R.auditLogs} days.</li>
          <li><strong>Server request logs:</strong> a few days at the hosting provider.</li>
          <li><strong>After account deletion:</strong> personal data is removed immediately; frozen monthly rankings keep only the product name and position as historical record, and pseudonymous identity hashes become unlinkable because the project key is gone.</li>
        </ul>
        <p>Statutory retention duties (e.g. § 147 AO, § 257 HGB for business correspondence) prevail where they apply.</p>
      </Section>

      <Section id="cookies" title="7. Cookies">
        <p>UserTrack uses <strong>only strictly necessary cookies</strong>: the Better Auth session cookie that keeps you signed in (and its short-lived CSRF / state cookies during sign-in with a provider). They are required to provide the service you asked for (§ 25(2) no. 2 TDDDG), so <strong>no consent banner is shown</strong>. There are no advertising, tracking or third-party cookies, and embeds and badges set no cookies on the sites that host them. Local storage is used for interface preferences such as chart ranges and, while you are signed in, for the pseudonymous analytics id described in section 8.</p>
      </Section>

      <Section id="analytics" title="8. Analytics">
        <p>We measure page views and product usage with <strong>Rybbit</strong>, an open-source analytics tool that we host ourselves on EU infrastructure operated by {OPERATOR.name}. It is <strong>cookieless</strong>, performs no cross-site tracking and does not use session replay. Besides page views we record product events (for example “sign-up completed”, “source connected”, “badge snippet copied”), clicks on outbound links, button clicks and form submissions (the fact of a submission, never what was typed), Core Web Vitals and JavaScript errors. Event properties are limited to categories such as a provider name or a step number — never e-mail addresses, handles or third-party URLs. Your IP address is used only to derive a daily-rotating, salted hash for counting unique visitors and is never stored; coarse location (country / region), browser family, referrer and page path are aggregated; the paths of password-reset and e-mail-preference links are masked so tokens never reach analytics. While you are signed in, events are linked to your <strong>pseudonymous account id</strong> (a random identifier, never your name or e-mail) so that we can see where founders get stuck between sign-up and a published page; it is kept in your browser's local storage and removed when you sign out. This processing is based on our legitimate interest in understanding and improving the service (Art. 6(1)(f) GDPR). If you still prefer not to be counted, set <code className="font-mono text-foreground">localStorage.setItem(&quot;disable-rybbit&quot;, &quot;1&quot;)</code> in your browser.</p>
      </Section>

      <Section id="public" title="9. Public by design">
        <p>A founder profile and the growth data of a published product are <strong>intentionally public</strong>: that is what UserTrack is for. Only what the founder publishes is shown (per-metric visibility toggles; conversion data is private by default), and every number carries its verification label. Founders control the exposure from the dashboard: unpublish a product, switch the profile to private, use <strong>anonymous mode</strong> (product shown without the founder), and <strong>hide from search engines</strong> (pages served with <code className="font-mono text-foreground">noindex</code>). Public data may be cached by search engines and reused under the licence in our <a href="/terms#licence">Terms</a>; we cannot recall copies made by third parties while a page was public.</p>
      </Section>

      <Section id="rights" title="10. Your rights">
        <p>Under the GDPR you have the right to <strong>access</strong> (Art. 15), <strong>rectification</strong> (Art. 16), <strong>erasure</strong> (Art. 17), <strong>restriction of processing</strong> (Art. 18), <strong>data portability</strong> (Art. 20) and to <strong>object</strong> to processing based on legitimate interests (Art. 21). Where processing is based on consent you may <strong>withdraw</strong> it at any time with effect for the future (Art. 7(3)). We do not use automated decision-making within the meaning of Art. 22.</p>
        <p>To exercise these rights, email <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a> from the address of your account; we answer within one month. You also have the right to lodge a complaint with a supervisory authority, in particular the <a href={SUPERVISORY_AUTHORITY.url} rel="noopener noreferrer" target="_blank">{SUPERVISORY_AUTHORITY.name}</a>, {SUPERVISORY_AUTHORITY.address}.</p>
      </Section>

      <Section id="self-service" title="11. Deletion and export">
        <p>You can <strong>delete your account</strong> yourself at <a href="/app/settings#data-privacy">/app/settings#data-privacy</a> (Settings → Data &amp; privacy → Delete account; you confirm by typing DELETE and receive one confirmation email). Deletion removes your account, profile, products, connected-source credentials, tokens, webhooks, follows, preferences and email log; public pages disappear immediately and the sitemap is updated at the next crawl. You can also <strong>export</strong> everything we hold about you from the same panel (“Download my data”, <code>/api/account/export</code>) as a machine-readable JSON file (Art. 20). Individual products, sources, tokens and the X connection can be removed separately from their own pages.</p>
      </Section>

      <Section id="children" title="12. Children">
        <p>UserTrack is a service for founders and is not directed at children. You must be at least <strong>16 years old</strong> to create an account. If you believe a younger person has registered, tell us and we will delete the account.</p>
      </Section>

      <Section id="security" title="13. Security">
        <p>Traffic is encrypted in transit (TLS, HSTS), passwords are hashed, tokens are stored as hashes, connected-source credentials are stored server-side and never returned by any interface, every outbound fetch to a founder-supplied host is checked against private and internal address ranges, and request rates are limited. Sync jobs read aggregates only; they never write to your systems.</p>
      </Section>

      <Section id="changes" title="14. Changes">
        <p>We update this policy when the service or the law changes. The effective date at the top tells you the current version; material changes are announced by email to account holders before they take effect. Earlier versions are available on request.</p>
      </Section>
    </LegalPage>
  );
}
