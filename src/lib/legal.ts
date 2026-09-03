// Operator data mirrors https://thecodecave.de/impressum; change it there first.
export const OPERATOR = {
  name: "The CodeCave GmbH",
  street: "Alfred-Nobel-Str. 29",
  city: "50226 Frechen",
  region: "Nordrhein-Westfalen",
  country: "Deutschland",
  email: "info@thecodecave.de",
  phone: "+49 152 04943138",
  phoneHref: "tel:+4915204943138",
  directors: ["Aleksandar Jovanovic", "Tilman Kieselbach"],
  court: "Amtsgericht Bielefeld",
  register: "HRB 44492",
  vatId: "DE346809827",
  odrUrl: "https://ec.europa.eu/consumers/odr/",
} as const;

// Confirm before launch (HUMAN_TODO.md → Legal pages).
export const EFFECTIVE_DATE = "2026-09-04";

// Retention periods in days, the source of truth for the privacy policy and the retention sweep.
export const RETENTION_DAYS = {
  syncRuns: 30,
  webhookDeliveries: 30,
  emailLog: 180,
  apiUsage: 90,
  auditLogs: 365,
  snapshotsRawBeforeAggregation: 180,
} as const;

export const LEGAL_PAGES = [
  { href: "/impressum", label: "Impressum" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
] as const;

export const SUPERVISORY_AUTHORITY = {
  name: "Landesbeauftragte für Datenschutz und Informationsfreiheit Nordrhein-Westfalen",
  address: "Kavalleriestraße 2–4, 40213 Düsseldorf, Germany",
  url: "https://www.ldi.nrw.de",
} as const;
