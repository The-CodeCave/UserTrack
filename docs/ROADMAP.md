# Post-MVP roadmap

## Known gaps
- Password reset (Better Auth supports it; needs an email provider — Resend).
- Secrets in `integrations.config` are at-rest encrypted by Convex only; add envelope encryption.
- Logo/avatar are URLs; add Convex file storage upload.
- Demo rows are hidden from ranks but still listed; auto-hide once ≥ 5 real verified SaaS exist.
- `/leaderboard/[range]` — only 30d ranking exists today (series charts support all ranges).
- Codecraft `.codecraft/actions.json` schema didn't register; dev server is started manually.

## Next
1. More providers: Firebase Auth, Auth0, Postgres read-only, Stripe customers (as a proxy).
2. Domain verification (DNS TXT / meta tag) so any endpoint can become verified.
3. Milestone posts ("crossed 10k users") with OG cards; weekly digest email.
4. Embeddable badge / iframe chart for founders' sites.
5. Public API (`/api/v1/saas/:slug`) and RSS of new listings.
6. Rate limiting on auth + sync-now; abuse reporting.
7. i18n number formats; light theme (design is dark-only by intent).
