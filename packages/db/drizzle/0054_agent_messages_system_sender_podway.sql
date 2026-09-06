-- Backfill: rename the system message-sender value podbay → podway (2026-09 rename).
-- agent_messages.from_pod stores the reserved system sender for delivery-bounce notices.
-- SYSTEM_SENDER changed "podbay" → "podway"; convert existing rows so they still classify
-- as system notices. Idempotent: re-running matches no rows once converted. No default/CHECK
-- exists on the column, so this is a plain value update — backward-compatible (read paths
-- accept both values via isSystemSender during the transition).
UPDATE "agent_messages" SET "from_pod" = 'podway' WHERE "from_pod" = 'podbay';
