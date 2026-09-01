# CodeCraft Loop

Repeatable delivery loop used for UserTrack. All phases run on **Fable 5.1** (planning, implementation, review, repair). No model hand-off between phases.

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
