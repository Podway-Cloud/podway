-- Re-anchor pod sizes to the RAM ladder (size-based-pod-pricing).
-- Old s/m/l = 4/8/16 GB RAM. New mini/s/m/l/xl = 1/2/4/8/16 GB. Existing pods are relabelled by
-- RAM so NOTHING actually resizes: old s(4GB)->m, old m(8GB)->l, old l(16GB)->xl. diskGb is grow-only
-- and untouched; the slot count (memory/4) is preserved because RAM is preserved.
-- Order matters: promote the largest first so a row is never mapped twice.
UPDATE "pods" SET "size" = 'xl' WHERE "size" = 'l';
--> statement-breakpoint
UPDATE "pods" SET "size" = 'l' WHERE "size" = 'm';
--> statement-breakpoint
UPDATE "pods" SET "size" = 'm' WHERE "size" = 's';
--> statement-breakpoint
ALTER TABLE "pods" ALTER COLUMN "size" SET DEFAULT 'm';
