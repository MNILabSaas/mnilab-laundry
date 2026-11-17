import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialLaundryAuthSchema1794100000000 implements MigrationInterface {
  name = 'InitialLaundryAuthSchema1794100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`
      CREATE TABLE "tenant_profiles" (
        "tenant_id" uuid NOT NULL,
        "slug" varchar(80) NOT NULL,
        "brand_name" varchar(120) NOT NULL,
        "tagline" varchar(200) NOT NULL DEFAULT 'Mitra Laundry Terpercaya',
        "logo_url" text,
        "theme_config_json" jsonb NOT NULL DEFAULT '{"primaryColor":"#9fe870","primaryHoverColor":"#8ee05c","darkColor":"#163300","secondaryColor":"#054d28","surfaceColor":"#e2f6d5"}',
        "whatsapp_phone" varchar(30),
        "is_demo" boolean NOT NULL DEFAULT false,
        "subscription_status" varchar(30) NOT NULL DEFAULT 'ACTIVE',
        "max_branches" int NOT NULL DEFAULT 3,
        "synced_at" timestamptz NOT NULL DEFAULT now(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tenant_profiles" PRIMARY KEY ("tenant_id"),
        CONSTRAINT "UQ_tenant_profiles_slug" UNIQUE ("slug")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "branches" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "name" varchar(100) NOT NULL,
        "code" varchar(20) NOT NULL,
        "address" text,
        "phone" varchar(20),
        "whatsapp_number" varchar(30),
        "ironing_rate" numeric(10,2) NOT NULL DEFAULT 1100,
        "open_time" varchar(10) NOT NULL DEFAULT '08:00',
        "close_time" varchar(10) NOT NULL DEFAULT '21:00',
        "default_min_weight_kg" numeric(8,2) DEFAULT 3,
        "pay_later_fee" numeric(10,2) NOT NULL DEFAULT 1000,
        "latitude" numeric(10,7),
        "longitude" numeric(10,7),
        "attendance_radius_meters" int NOT NULL DEFAULT 10,
        "is_main" boolean NOT NULL DEFAULT false,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_branches" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_branches_tenant_code" UNIQUE ("tenant_id", "code")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_branches_tenant" ON "branches" ("tenant_id")`);

    await queryRunner.query(`
      CREATE TABLE "laundry_staff" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "platform_user_id" uuid NOT NULL,
        "branch_id" uuid,
        "name" varchar(100) NOT NULL,
        "email" varchar(150),
        "phone" varchar(30),
        "role" varchar(30) NOT NULL,
        "avatar_url" text,
        "face_descriptor" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_laundry_staff" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_laundry_staff_tenant_platform_user" UNIQUE ("tenant_id", "platform_user_id"),
        CONSTRAINT "CHK_laundry_staff_contact" CHECK ("email" IS NOT NULL OR "phone" IS NOT NULL),
        CONSTRAINT "FK_laundry_staff_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_laundry_staff_tenant" ON "laundry_staff" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_laundry_staff_branch" ON "laundry_staff" ("branch_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_laundry_staff_role" ON "laundry_staff" ("role")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "laundry_staff"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "branches"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant_profiles"`);
  }
}
