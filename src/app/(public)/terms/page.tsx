import type { Metadata } from "next";
import { LegalPage, Section } from "@/components/site/legal-page";
import { EFFECTIVE_DATE, OPERATOR } from "@/lib/legal";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms for using UserTrack: the free public growth leaderboard, API, MCP server, webhooks and embeds operated by The CodeCave GmbH under German law.",
  alternates: { canonical: `${SITE_URL}/terms` },
};

const TOC: [string, string][] = [
  ["parties", "Parties and scope"],
  ["service", "The service"],
  ["account", "Account and eligibility"],
  ["sources", "Connected sources"],
  ["verification", "Truthfulness and review"],
  ["acceptable-use", "Acceptable use"],
  ["licence", "Licence for published data"],
  ["availability", "Availability and changes"],
  ["termination", "Termination"],
  ["liability", "Liability"],
  ["law", "Governing law and venue"],
  ["final", "Final provisions"],
];

export default function TermsPage() {
  return (
    <LegalPage
      label="Legal"
      title="Terms of Service"
      intro={<>These terms govern the use of UserTrack (usertrack.dev), its dashboard, public pages, API, MCP server, webhooks and embeds. UserTrack is free; in return we ask for honest data and fair use.</>}
      effective={`Effective date: ${EFFECTIVE_DATE}`}
      toc={TOC}
    >
      <Section id="parties" title="1. Parties and scope">
        <p>The service is provided by <strong>{OPERATOR.name}</strong>, {OPERATOR.street}, {OPERATOR.city}, Germany, registered at {OPERATOR.court} under {OPERATOR.register}, represented by its managing directors {OPERATOR.directors.join(" and ")} (“UserTrack”, “we”). Contact: <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>; full details in the <a href="/impressum">Impressum</a>.</p>
        <p>These terms apply to everyone who uses UserTrack: <strong>founders</strong> who create an account and publish growth data, and <strong>visitors</strong> who browse public pages, call the API, use the MCP server or view an embed. By creating an account or using the API you accept them. Deviating terms of yours do not apply.</p>
      </Section>

      <Section id="service" title="2. The service">
        <p>UserTrack is a public, verifiable leaderboard of SaaS and app <strong>user growth</strong>. It consists of:</p>
        <ul>
          <li><strong>Public growth pages</strong> per product (users, new users, growth, activation and conversion rates where published, milestones, history and verification labels), founder profiles, leaderboards, trending, category and discovery pages, compare pages and monthly ranking archives;</li>
          <li>a <strong>dashboard</strong> to create products, connect read-only data sources, choose what is public, and follow other products;</li>
          <li>a <strong>public JSON API</strong> and downloadable <strong>datasets</strong>, an <strong>MCP server</strong> for AI agents, signed <strong>webhooks</strong>, SVG badges and iframe <strong>embeds</strong>, share cards and optional email digests and reports;</li>
          <li>an optional connection to your X account for posting share cards.</li>
        </ul>
        <p>UserTrack counts <strong>users, never revenue</strong>. We do not request, store or display amounts, prices, MRR or profit, and no feature will ask you for them.</p>
      </Section>

      <Section id="account" title="3. Account and eligibility">
        <p>You must be at least 16 years old and use the service on behalf of a product you are entitled to represent — as founder, employee or with the owner’s authorisation. One person, one account; a verified email address is required before anything can be published. Keep your password, API keys, MCP tokens and webhook secrets confidential; actions taken with them count as yours until you tell us they were compromised, at which point we will revoke them. You are responsible for the accuracy of the profile and product information you enter.</p>
      </Section>

      <Section id="sources" title="4. Connected sources">
        <p>UserTrack reads aggregate counts from data sources you connect. You promise that:</p>
        <ul>
          <li>you have the <strong>right to connect</strong> each source and to publish the resulting counts;</li>
          <li>you provide <strong>read-only</strong> credentials wherever the provider offers them (read-only database roles, restricted API keys, metrics-only scopes) and rotate them if you suspect misuse;</li>
          <li>sources report <strong>no personal data</strong> of your users: identity matching accepts opaque ids only, anything resembling an email address is discarded, and you will not encode names or contact data into ids;</li>
          <li>you keep your provider’s terms (Stripe, Google, PostHog and so on) when sharing counts with us.</li>
        </ul>
        <p>We store the credentials server-side, use them only for syncs you configured, never return them through any interface and delete them when you remove the source or your account. We never write to your systems.</p>
      </Section>

      <Section id="verification" title="5. Truthfulness and review">
        <p>The value of UserTrack is that the numbers are honest. You must not inflate counts, connect sources that do not belong to the product, report test or bot accounts as users, or switch sources to hide history. Every number carries the verification level of its source (verified · partially verified · self-reported); self-reported products are never ranked.</p>
        <p>We may run automated plausibility checks and manual reviews. If data looks implausible we may mark a product as <strong>“Data under review”</strong>, remove it from rankings, unpublish it, or in serious cases delete it and terminate the account. We will tell you what triggered the review where doing so does not defeat its purpose, and restore the product once the issue is resolved. A review is not an accusation; it is how we keep the board fair for everyone.</p>
      </Section>

      <Section id="acceptable-use" title="6. Acceptable use">
        <p>You may use the public pages, API, datasets and MCP server for any lawful purpose within the published limits (currently 60 anonymous requests per minute, 1,000 per day with an API key, per-IP limits on badges and embeds). You must not:</p>
        <ul>
          <li>scrape or crawl the website to bypass the API and its limits, or evade rate limits with rotating keys or addresses;</li>
          <li>resell access to the service or present UserTrack data as your own verified measurement;</li>
          <li>probe, overload or interfere with the service, other users’ webhooks or third-party systems through UserTrack (for example by pointing a source or webhook at internal addresses);</li>
          <li>upload unlawful, misleading or infringing content (product names, logos, descriptions, profile text) or impersonate another person or company;</li>
          <li>use the service to send unsolicited messages, or connect an X account you are not entitled to use.</li>
        </ul>
        <p>Tokens and webhooks that violate these rules may be revoked without notice.</p>
      </Section>

      <Section id="licence" title="7. Licence for published data">
        <p><strong>Your content.</strong> You keep all rights to the product information, logos and descriptions you provide. You grant us a non-exclusive, worldwide, royalty-free licence to host, display, aggregate, rank, cache and distribute them as part of the service — including in share cards, embeds, OG images, the API, datasets and social posts you opted in to — for as long as the content is published on UserTrack.</p>
        <p><strong>Public growth data.</strong> Public growth data (user counts, growth rates, ranks, trending scores, milestones and their history as exposed on public pages, the API and the datasets) is licensed to everyone under the <a href="https://creativecommons.org/licenses/by/4.0/" rel="noopener noreferrer" target="_blank">Creative Commons Attribution 4.0 (CC BY 4.0)</a> licence: you may copy, redistribute and build upon it, including commercially, provided you credit <strong>“UserTrack”</strong> with a link to the source page and do not imply endorsement. Trademarks and logos of listed products are excluded and remain with their owners; the UserTrack name, logo, design and ranking methodology remain ours.</p>
        <p><strong>Founders’ view.</strong> By publishing a product you agree that its public growth data is made available under this licence for as long as it is public. Unpublishing stops future distribution but cannot recall copies that third parties made while the data was public.</p>
      </Section>

      <Section id="availability" title="8. Availability and changes">
        <p>UserTrack is provided <strong>free of charge</strong> and <strong>as is</strong>. We aim for high availability but give <strong>no uptime guarantee or SLA</strong>. Syncs run on a schedule (every four hours) and may be delayed or fail when a provider is unavailable. We may change, add, limit or discontinue features, boards, ranking formulas, API fields and rate limits at any time; breaking API changes are versioned or announced on the developers page with reasonable notice where practicable. We may introduce paid features in the future; anything that costs money will be clearly marked and require your separate agreement.</p>
      </Section>

      <Section id="termination" title="9. Termination">
        <p>You may stop using UserTrack and delete your account at any time from <a href="/app/settings">/app/settings</a>; deletion removes your data as described in the <a href="/privacy#self-service">Privacy Policy</a>. We may suspend or terminate accounts that violate these terms, that are inactive with no published product for more than 24 months, or if we discontinue the service, in which case we will give at least 30 days’ notice by email where possible. Sections 7 (for data already distributed), 10, 11 and 12 survive termination.</p>
      </Section>

      <Section id="liability" title="10. Liability">
        <p>UserTrack is a gratuitous service. In line with the German statutory rules for gratuitous performance (cf. §§ 521, 599 BGB), <strong>we are liable only for intent and gross negligence</strong>, except that we remain fully liable, irrespective of fault, for damage to life, body or health, under the Product Liability Act (Produkthaftungsgesetz), for guarantees we expressly gave and for fraudulent concealment of defects.</p>
        <p>For slight negligence we are liable only where we breach an <strong>essential contractual duty</strong> (cardinal duty — a duty whose fulfilment makes the proper performance of the contract possible in the first place and on whose fulfilment you may regularly rely, such as keeping your connected-source credentials confidential); in that case liability is limited to the foreseeable damage typical for this kind of service.</p>
        <p>We are not liable for the accuracy of data provided by founders or their sources, for ranking positions, for the availability or behaviour of third-party providers, for decisions you or others take based on UserTrack data, or for lost profits. The above also applies to our managing directors, employees and agents. Mandatory consumer rights remain unaffected.</p>
      </Section>

      <Section id="law" title="11. Governing law and venue">
        <p>These terms and every dispute arising from the use of UserTrack are governed by the <strong>law of the Federal Republic of Germany</strong>, excluding the UN Convention on Contracts for the International Sale of Goods (CISG). If you are a consumer, mandatory provisions of the law of your country of habitual residence remain unaffected.</p>
        <p>If you are a merchant (Kaufmann), a legal entity under public law or a special fund under public law, or have no general place of jurisdiction in Germany, the <strong>exclusive place of jurisdiction is Cologne (Köln), Germany</strong>, the courts competent for our registered seat in Frechen. We are neither willing nor obliged to take part in dispute resolution before a consumer arbitration board; the EU online dispute resolution platform is at <a href={OPERATOR.odrUrl} rel="noopener noreferrer" target="_blank">{OPERATOR.odrUrl}</a>.</p>
      </Section>

      <Section id="final" title="12. Final provisions">
        <p><strong>Changes to these terms.</strong> We may amend these terms for good reason (changes in law, new features, abuse). Account holders are notified by email at least 14 days before material changes take effect; if you do not object before that date, or keep using the service afterwards, the new terms apply. If you object, either side may terminate the account.</p>
        <p><strong>Severability.</strong> Should any provision of these terms be or become invalid, the remaining provisions remain in force; the invalid provision is replaced by the statutory rule that comes closest to its economic purpose.</p>
        <p><strong>Language.</strong> These terms are written in English; the German law terms in brackets are decisive for their legal meaning. The Impressum is provided in German as required by German law.</p>
      </Section>
    </LegalPage>
  );
}
