import type { MigrationInterface, QueryRunner } from 'typeorm';

export class LaundryOperationalSchema1794100001000 implements MigrationInterface {
  name = 'LaundryOperationalSchema1794100001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "customers" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "name" varchar(100) NOT NULL,
        "phone" varchar(25) NOT NULL,
        "address" text,
        "notes" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_customers" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_customers_tenant_phone" UNIQUE ("tenant_id", "phone")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_customers_tenant" ON "customers" ("tenant_id")`);

    await queryRunner.query(`
      CREATE TABLE "laundry_services" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "branch_id" uuid,
        "name" varchar(100) NOT NULL,
        "description" text,
        "workflow" varchar(30) NOT NULL,
        "price_unit" varchar(20) NOT NULL,
        "price" numeric(12,2) NOT NULL,
        "min_weight_kg" numeric(8,2),
        "estimated_duration_hours" int,
        "discount_type" varchar(20) NOT NULL DEFAULT 'NONE',
        "discount_value" numeric(12,2) NOT NULL DEFAULT 0,
        "discount_active" boolean NOT NULL DEFAULT false,
        "is_third_party" boolean NOT NULL DEFAULT false,
        "third_party_partner" varchar(150),
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_laundry_services" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_laundry_services_price" CHECK ("price" >= 0),
        CONSTRAINT "CHK_laundry_services_min_weight" CHECK ("min_weight_kg" IS NULL OR "min_weight_kg" > 0),
        CONSTRAINT "CHK_laundry_services_duration" CHECK ("estimated_duration_hours" IS NULL OR "estimated_duration_hours" > 0),
        CONSTRAINT "FK_laundry_services_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_laundry_services_tenant" ON "laundry_services" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_laundry_services_branch" ON "laundry_services" ("branch_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_laundry_services_tenant_branch_name" ON "laundry_services" ("tenant_id", COALESCE("branch_id", '00000000-0000-0000-0000-000000000000'::uuid), LOWER("name"))`);

    await queryRunner.query(`
      CREATE TABLE "service_price_history" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "service_id" uuid NOT NULL,
        "old_price" numeric(12,2) NOT NULL,
        "new_price" numeric(12,2) NOT NULL,
        "changed_by_staff_id" uuid,
        "reason" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_service_price_history" PRIMARY KEY ("id"),
        CONSTRAINT "FK_service_price_history_service" FOREIGN KEY ("service_id") REFERENCES "laundry_services"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_service_price_history_tenant" ON "service_price_history" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_service_price_history_service" ON "service_price_history" ("service_id")`);

    await queryRunner.query(`
      CREATE TABLE "laundry_orders" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "order_number" varchar(30) NOT NULL,
        "branch_id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "cashier_staff_id" uuid NOT NULL,
        "received_at" timestamptz NOT NULL DEFAULT now(),
        "estimated_completion_at" timestamptz,
        "subtotal" numeric(12,2) NOT NULL,
        "discount" numeric(12,2) NOT NULL DEFAULT 0,
        "is_pay_later" boolean NOT NULL DEFAULT false,
        "pay_later_fee" numeric(12,2) NOT NULL DEFAULT 0,
        "total" numeric(12,2) NOT NULL,
        "paid_amount" numeric(12,2) NOT NULL DEFAULT 0,
        "payment_status" varchar(20) NOT NULL DEFAULT 'UNPAID',
        "notes" text,
        "picked_up_at" timestamptz,
        "picked_up_by_staff_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_laundry_orders" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_laundry_orders_tenant_number" UNIQUE ("tenant_id", "order_number"),
        CONSTRAINT "CHK_laundry_orders_amounts" CHECK ("subtotal" >= 0 AND "discount" >= 0 AND "discount" <= "subtotal"),
        CONSTRAINT "CHK_laundry_orders_total" CHECK ("total" = "subtotal" - "discount" + "pay_later_fee"),
        CONSTRAINT "CHK_laundry_orders_paid" CHECK ("paid_amount" >= 0 AND "paid_amount" <= "total"),
        CONSTRAINT "FK_laundry_orders_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_laundry_orders_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_laundry_orders_cashier" FOREIGN KEY ("cashier_staff_id") REFERENCES "laundry_staff"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_laundry_orders_picked_up" FOREIGN KEY ("picked_up_by_staff_id") REFERENCES "laundry_staff"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_laundry_orders_tenant" ON "laundry_orders" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_laundry_orders_branch" ON "laundry_orders" ("branch_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_laundry_orders_customer" ON "laundry_orders" ("customer_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_laundry_orders_received_at" ON "laundry_orders" ("received_at")`);
    await queryRunner.query(`CREATE INDEX "IDX_laundry_orders_payment_status" ON "laundry_orders" ("payment_status")`);

    await queryRunner.query(`
      CREATE TABLE "ironing_payouts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "branch_id" uuid NOT NULL,
        "employee_staff_id" uuid NOT NULL,
        "period_month" int NOT NULL,
        "period_year" int NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "total_items" int NOT NULL DEFAULT 0,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "employee_notes" text,
        "transfer_proof" text,
        "payment_notes" text,
        "paid_by_staff_id" uuid,
        "paid_at" timestamptz,
        "rejected_by_staff_id" uuid,
        "rejected_at" timestamptz,
        "rejection_reason" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ironing_payouts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ironing_payouts_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ironing_payouts_employee" FOREIGN KEY ("employee_staff_id") REFERENCES "laundry_staff"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ironing_payouts_paid_by" FOREIGN KEY ("paid_by_staff_id") REFERENCES "laundry_staff"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_ironing_payouts_rejected_by" FOREIGN KEY ("rejected_by_staff_id") REFERENCES "laundry_staff"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_ironing_payouts_tenant" ON "ironing_payouts" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_ironing_payouts_branch" ON "ironing_payouts" ("branch_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_ironing_payouts_staff" ON "ironing_payouts" ("employee_staff_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_ironing_payouts_status" ON "ironing_payouts" ("status")`);

    await queryRunner.query(`
      CREATE TABLE "laundry_order_items" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "order_id" uuid NOT NULL,
        "service_id" uuid NOT NULL,
        "service_name" varchar(100) NOT NULL,
        "workflow" varchar(30) NOT NULL,
        "price_unit" varchar(20) NOT NULL,
        "unit_price" numeric(12,2) NOT NULL,
        "weight_kg" numeric(8,2),
        "garment_count" int,
        "quantity" numeric(10,2) NOT NULL,
        "item_total" numeric(12,2) NOT NULL,
        "discount_amount" numeric(12,2) NOT NULL DEFAULT 0,
        "status" varchar(30) NOT NULL,
        "notes" text,
        "ironing_staff_id" uuid,
        "ironing_started_at" timestamptz,
        "ironing_completed_at" timestamptz,
        "ironing_rate" numeric(10,2),
        "ironing_wage" numeric(12,2),
        "ironing_payout_id" uuid,
        "ironing_paid_at" timestamptz,
        "rack_number" varchar(20),
        "rack_assigned_by_staff_id" uuid,
        "rack_assigned_at" timestamptz,
        "completed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_laundry_order_items" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_laundry_order_items_amounts" CHECK ("quantity" > 0 AND "unit_price" >= 0 AND "item_total" >= 0),
        CONSTRAINT "CHK_laundry_order_items_weight" CHECK ("weight_kg" IS NULL OR "weight_kg" > 0),
        CONSTRAINT "CHK_laundry_order_items_garment_count" CHECK ("garment_count" IS NULL OR "garment_count" > 0),
        CONSTRAINT "CHK_laundry_order_items_done_rack" CHECK ("status" <> 'SELESAI' OR "rack_number" IS NOT NULL),
        CONSTRAINT "FK_laundry_order_items_order" FOREIGN KEY ("order_id") REFERENCES "laundry_orders"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_laundry_order_items_service" FOREIGN KEY ("service_id") REFERENCES "laundry_services"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_laundry_order_items_ironing_staff" FOREIGN KEY ("ironing_staff_id") REFERENCES "laundry_staff"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_laundry_order_items_ironing_payout" FOREIGN KEY ("ironing_payout_id") REFERENCES "ironing_payouts"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_laundry_order_items_tenant" ON "laundry_order_items" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_laundry_order_items_order" ON "laundry_order_items" ("order_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_laundry_order_items_status" ON "laundry_order_items" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_laundry_order_items_ironing_staff" ON "laundry_order_items" ("ironing_staff_id")`);

    await queryRunner.query(`
      CREATE TABLE "order_status_history" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "order_item_id" uuid NOT NULL,
        "from_status" varchar(30),
        "to_status" varchar(30) NOT NULL,
        "changed_by_staff_id" uuid,
        "notes" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_status_history" PRIMARY KEY ("id"),
        CONSTRAINT "FK_order_status_history_item" FOREIGN KEY ("order_item_id") REFERENCES "laundry_order_items"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_order_status_history_staff" FOREIGN KEY ("changed_by_staff_id") REFERENCES "laundry_staff"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_order_status_history_tenant" ON "order_status_history" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_order_status_history_item" ON "order_status_history" ("order_item_id")`);

    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "order_id" uuid NOT NULL,
        "branch_id" uuid NOT NULL,
        "cashier_staff_id" uuid NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "method" varchar(20) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'SUCCESS',
        "reference" varchar(120),
        "paid_at" timestamptz NOT NULL DEFAULT now(),
        "notes" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payments" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_payments_amount" CHECK ("amount" > 0),
        CONSTRAINT "FK_payments_order" FOREIGN KEY ("order_id") REFERENCES "laundry_orders"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_payments_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_payments_cashier" FOREIGN KEY ("cashier_staff_id") REFERENCES "laundry_staff"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_payments_tenant" ON "payments" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_payments_order" ON "payments" ("order_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_payments_branch" ON "payments" ("branch_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_payments_status" ON "payments" ("status")`);

    await queryRunner.query(`
      CREATE TABLE "expense_categories" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "name" varchar(80) NOT NULL,
        "description" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_expense_categories" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_expense_categories_tenant_name" UNIQUE ("tenant_id", "name")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_expense_categories_tenant" ON "expense_categories" ("tenant_id")`);

    await queryRunner.query(`
      CREATE TABLE "expenses" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "branch_id" uuid NOT NULL,
        "category_id" uuid NOT NULL,
        "recorded_by_staff_id" uuid NOT NULL,
        "description" varchar(255) NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "expense_date" date NOT NULL,
        "payment_method" varchar(20) NOT NULL,
        "receipt_url" text,
        "notes" text,
        "approval_status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "approved_by_staff_id" uuid,
        "approved_at" timestamptz,
        "approval_notes" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_expenses" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_expenses_amount" CHECK ("amount" > 0),
        CONSTRAINT "FK_expenses_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_expenses_category" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_expenses_recorded_by" FOREIGN KEY ("recorded_by_staff_id") REFERENCES "laundry_staff"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_expenses_approved_by" FOREIGN KEY ("approved_by_staff_id") REFERENCES "laundry_staff"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_expenses_tenant" ON "expenses" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_expenses_branch" ON "expenses" ("branch_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_expenses_category" ON "expenses" ("category_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_expenses_expense_date" ON "expenses" ("expense_date")`);
    await queryRunner.query(`CREATE INDEX "IDX_expenses_approval_status" ON "expenses" ("approval_status")`);

    await queryRunner.query(`
      CREATE TABLE "cash_settlements" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "branch_id" uuid NOT NULL,
        "settlement_date" date NOT NULL,
        "cashier_staff_id" uuid NOT NULL,
        "total_cash_in" numeric(12,2) NOT NULL DEFAULT 0,
        "total_qris_in" numeric(12,2) NOT NULL DEFAULT 0,
        "total_approved_expense" numeric(12,2) NOT NULL DEFAULT 0,
        "expected_cash" numeric(12,2) NOT NULL DEFAULT 0,
        "actual_cash" numeric(12,2) NOT NULL DEFAULT 0,
        "difference" numeric(12,2) NOT NULL DEFAULT 0,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "cashier_notes" text,
        "reviewed_by_staff_id" uuid,
        "reviewed_at" timestamptz,
        "review_notes" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cash_settlements" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_cash_settlements_tenant_branch_date" UNIQUE ("tenant_id", "branch_id", "settlement_date"),
        CONSTRAINT "FK_cash_settlements_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_cash_settlements_cashier" FOREIGN KEY ("cashier_staff_id") REFERENCES "laundry_staff"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_cash_settlements_reviewer" FOREIGN KEY ("reviewed_by_staff_id") REFERENCES "laundry_staff"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_cash_settlements_tenant" ON "cash_settlements" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_cash_settlements_branch" ON "cash_settlements" ("branch_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_cash_settlements_date" ON "cash_settlements" ("settlement_date")`);
    await queryRunner.query(`CREATE INDEX "IDX_cash_settlements_status" ON "cash_settlements" ("status")`);

    await queryRunner.query(`
      CREATE TABLE "attendances" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "branch_id" uuid NOT NULL,
        "staff_id" uuid NOT NULL,
        "recorded_by_staff_id" uuid,
        "attendance_date" date NOT NULL,
        "check_in_at" timestamptz NOT NULL DEFAULT now(),
        "check_out_at" timestamptz,
        "check_in_lat" numeric(10,7),
        "check_in_lng" numeric(10,7),
        "check_in_distance_meters" numeric(10,2),
        "check_out_lat" numeric(10,7),
        "check_out_lng" numeric(10,7),
        "check_out_distance_meters" numeric(10,2),
        "face_distance" numeric(8,4),
        "notes" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_attendances" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_attendances_tenant_staff_date" UNIQUE ("tenant_id", "staff_id", "attendance_date"),
        CONSTRAINT "FK_attendances_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_attendances_staff" FOREIGN KEY ("staff_id") REFERENCES "laundry_staff"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_attendances_tenant" ON "attendances" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_attendances_branch" ON "attendances" ("branch_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_attendances_staff" ON "attendances" ("staff_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_attendances_date" ON "attendances" ("attendance_date")`);

    await queryRunner.query(`
      CREATE TABLE "leave_requests" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "branch_id" uuid NOT NULL,
        "staff_id" uuid NOT NULL,
        "leave_type" varchar(30) NOT NULL DEFAULT 'CUTI',
        "start_date" date NOT NULL,
        "end_date" date NOT NULL,
        "total_days" int NOT NULL DEFAULT 1,
        "reason" text NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "reviewed_by_staff_id" uuid,
        "reviewed_at" timestamptz,
        "review_notes" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_leave_requests" PRIMARY KEY ("id"),
        CONSTRAINT "FK_leave_requests_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_leave_requests_staff" FOREIGN KEY ("staff_id") REFERENCES "laundry_staff"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_leave_requests_reviewer" FOREIGN KEY ("reviewed_by_staff_id") REFERENCES "laundry_staff"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_leave_requests_tenant" ON "leave_requests" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_leave_requests_branch" ON "leave_requests" ("branch_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_leave_requests_staff" ON "leave_requests" ("staff_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_leave_requests_status" ON "leave_requests" ("status")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "leave_requests"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "attendances"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cash_settlements"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "expenses"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "expense_categories"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "order_status_history"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "laundry_order_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ironing_payouts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "laundry_orders"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "service_price_history"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "laundry_services"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "customers"`);
  }
}
