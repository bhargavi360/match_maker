# Matchmaker AI rebuild

This independent sibling implements Stages 3–8: design shell, authentication/profiles, deterministic matching, human match workflows, exact-approved email delivery and persistent internal chat.

- Read the installed Next.js guides under `node_modules/next/dist/docs/` before editing framework code.
- Keep `../matchmaker-dashboard` and its configuration, database, and Git state untouched.
- Stage 10 permits verification and substantiated, minimal regression fixes to implemented Stages 3–8. Preserve exact email approval, separate dispatch and evidence controls. Chat cannot approve matches or emails or dispatch email. Stage 9 recovery/deployment features remain absent; do not add them as part of QA. No legacy migration or deployment.
- Keep workflow transitions in the pure domain module; independently authenticate services, check revisions and write decisions/audits transactionally. Never approve through GET, navigation or AI.
- All Gemini access belongs in the server-only AI gateway. Tests must use fakes; never call a live provider in tests.
- Email transport/verification stays server-only. Never send through GET, approval, AI or chat. Preserve frozen payload/idempotency identity, transaction-before-network claims, honest UNKNOWN outcomes and retained evidence. See docs/email-delivery.md.
- Only the visual theme preference may be written to browser storage.
- Use semantic CSS tokens, typed synthetic data, local assets, and accessible controls.
- Run `npm run typecheck`, `npm run lint`, and `npm run build` for relevant changes.
- Authenticate protected services server-side; keep contacts out of ordinary DTOs and audit values.
- Use disposable owned databases for tests. Never reset the whole application database.
