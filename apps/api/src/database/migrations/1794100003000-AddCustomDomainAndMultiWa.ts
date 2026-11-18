import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomDomainAndMultiWa1794100003000 implements MigrationInterface {
  name = 'AddCustomDomainAndMultiWa1794100003000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_profiles"
      ADD COLUMN IF NOT EXISTS "custom_domain" varchar(160);
    `);
    await queryRunner.query(`
      ALTER TABLE "branches"
      ALTER COLUMN "phone" TYPE varchar(255),
      ALTER COLUMN "whatsapp_number" TYPE varchar(255),
      ADD COLUMN IF NOT EXISTS "whatsapp_numbers_json" jsonb DEFAULT '[]'::jsonb;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "branches"
      DROP COLUMN IF EXISTS "whatsapp_numbers_json";
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_profiles"
      DROP COLUMN IF EXISTS "custom_domain";
    `);
  }
}
