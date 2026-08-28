ALTER TABLE "users" ADD COLUMN "is_blocked" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "users_is_blocked_idx" ON "users"("is_blocked");
