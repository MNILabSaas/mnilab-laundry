import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomDomainAndMultiWa1794100003000 implements MigrationInterface {
  name = 'AddCustomDomainAndMultiWa1794100003000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_profiles"
      ADD COLUMN IF NOT EXISTS "custom_domain" varchar(160),
      ADD COLUMN IF NOT EXISTS "custom_domain_verified" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "custom_domain_verified_at" timestamptz,
      ADD COLUMN IF NOT EXISTS "bank_accounts_json" jsonb DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS "qris_config_json" jsonb;
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_tenant_profiles_custom_domain"
      ON "tenant_profiles" ("custom_domain")
      WHERE "custom_domain" IS NOT NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE "branches"
      ALTER COLUMN "phone" TYPE varchar(255),
      ALTER COLUMN "whatsapp_number" TYPE varchar(255),
      ADD COLUMN IF NOT EXISTS "whatsapp_numbers_json" jsonb DEFAULT '[]'::jsonb;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "qris_withdrawals" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "branch_id" uuid NOT NULL REFERENCES "branches"("id") ON DELETE CASCADE,
        "period_month" int NOT NULL,
        "period_year" int NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "total_transactions" int NOT NULL DEFAULT 0,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "requested_by_staff_id" uuid,
        "requested_by_name" varchar(120),
        "owner_notes" text,
        "target_bank_account_json" jsonb,
        "transfer_proof" text,
        "admin_notes" text,
        "reviewed_by_email" varchar(150),
        "reviewed_at" timestamptz,
        "rejection_reason" text,
        "gateway_meta_json" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "IDX_qris_withdrawals_tenant" ON "qris_withdrawals" ("tenant_id");
      CREATE INDEX IF NOT EXISTS "IDX_qris_withdrawals_branch" ON "qris_withdrawals" ("branch_id");
      CREATE INDEX IF NOT EXISTS "IDX_qris_withdrawals_status" ON "qris_withdrawals" ("status");

      ALTER TABLE "payments"
      ADD COLUMN IF NOT EXISTS "qris_withdrawal_id" uuid,
      ADD COLUMN IF NOT EXISTS "qris_settled_at" timestamptz,
      ADD COLUMN IF NOT EXISTS "qris_meta_json" jsonb;
      CREATE INDEX IF NOT EXISTS "IDX_payments_qris_withdrawal" ON "payments" ("qris_withdrawal_id");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_payments_qris_withdrawal";
      ALTER TABLE "payments"
      DROP COLUMN IF EXISTS "qris_meta_json",
      DROP COLUMN IF EXISTS "qris_settled_at",
      DROP COLUMN IF EXISTS "qris_withdrawal_id";
      DROP TABLE IF EXISTS "qris_withdrawals";
    `);
    await queryRunner.query(`
      ALTER TABLE "branches"
      DROP COLUMN IF EXISTS "whatsapp_numbers_json";
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_tenant_profiles_custom_domain";
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_profiles"
      DROP COLUMN IF EXISTS "qris_config_json",
      DROP COLUMN IF EXISTS "bank_accounts_json",
      DROP COLUMN IF EXISTS "custom_domain_verified_at",
      DROP COLUMN IF EXISTS "custom_domain_verified",
      DROP COLUMN IF EXISTS "custom_domain";
    `);
  }
}
