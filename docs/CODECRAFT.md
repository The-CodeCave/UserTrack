# CodeCraft Loop

Repeatable delivery loop used for UserTrack.

| Phase | What happens | Exit check |
|---|---|---|
| 1 DISCOVER | Inspect repo, tooling, external services; write assumptions | `docs/ASSUMPTIONS.md` updated |
| 2 PLAN | Epics → tickets with acceptance criteria and deps | `docs/BACKLOG.md` updated |
| 3 BUILD | Implement the current ticket | Code compiles |
| 4 VERIFY | `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, smoke test, screenshots at 375/768/1440 | All green |
| 5 REPAIR | Fix regressions, tighten empty/loading/error states | Re-run VERIFY |
| 6 SHIP | `npx convex deploy` + `railway up` | Prod URL responds, auth works |
| 7 DOCUMENT | README / ARCHITECTURE / BACKLOG / CHANGELOG | Ticket marked ☑ |
| 8 REPEAT | Next ticket by priority | – |

## Models per loop

| Loop | Model | Note |
|---|---|---|
| v0.1 – v0.9 | Fable 5.1 | All phases, no hand-off between them. |
| v1.0 launch hardening (SEC-1 … SOCIAL-1) | Fable 5.1 | Same loop, one ticket per run. |
| v1.0 launch hardening (OPS-1 … SHIP-1) | Opus 5 (1M context) | The Fable run hit its usage limit mid-loop; the remaining tickets were finished on Opus rather than waiting for the limit to reset. Same loop, same exit checks — no ticket was re-planned or re-scoped at the hand-off. |
| v1.0.1 review fixes (FIX-0 … SHIP-2) | Opus 5 (1M context) | **Review-driven, not feature-driven**: the backlog for this loop *was* the finding list of a post-v1.0 code review, so phase 2 PLAN was replaced by triaging that list into FIX-0..4 + SHIP-2. Every other phase is unchanged, and each ticket still ends with lint + typecheck + test + build green and exactly one commit. |

## Deviation in the v1.0 loop

Phase **6 SHIP** was deliberately *not* run: the tickets ended at "one commit, nothing pushed, nothing deployed".
Everything a human must do to actually ship — in order, with exact commands — is `HUMAN_TODO.md` → *Launch checklist*,
and the deploy / rollback procedure is `docs/RELEASE-v1.0.md`.

The v1.0.1 loop repeated the deviation: FIX-0..4 and SHIP-2 end at "one commit, pushed, nothing deployed".

The interim standalone waitlist app under `apps/waitlist/` was merged into `main` in SHIP-2. It stays a **separate
deployable** with its own workspace, Convex project and Railway service — the root toolchain excludes `apps` (A227), so it
never enters the product's VERIFY phase.
