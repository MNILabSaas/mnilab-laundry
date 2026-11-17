import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBranchLandingConfig1794100002000 implements MigrationInterface {
  name = 'AddBranchLandingConfig1794100002000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "branches"
      ADD COLUMN IF NOT EXISTS "landing_config_json" jsonb;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "branches"
      DROP COLUMN IF EXISTS "landing_config_json";
    `);
  }
}
