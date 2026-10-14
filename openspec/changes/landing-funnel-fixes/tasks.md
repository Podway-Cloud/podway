## 1. Wizard before sign-in (owner OK 2026-10-13)
- [x] 1.1 Anonymous wizard for app links; sign-in on "Create my free pod"; choices survive OAuth; no pod before sign-in; e2e
- [x] 1.2 Judge it by the existing funnel (CTA → signin_completed → pod_created), no new event type
## 3. Open catalog (owner OK 2026-10-13)
- [x] 3.1 Signed out `/start?tab=apps` renders the catalog publicly; cards → `/start?app=` with the ref; e2e
## 2. First screen (after owner picks a draft)
- [x] 2.1 Two above-the-fold drafts for the owner (owner picked Draft B "upkeep", 2026-10-14)
- [x] 2.2 A/B inside the selfhost arm: odd visitor id → upkeep hero; exposure item hero-upkeep / hero-current
