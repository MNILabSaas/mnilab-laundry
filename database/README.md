# Database `mnilab_laundry` (MNILab Laundry)

Skema dan migrasi TypeORM berada di [apps/api/src/database/migrations/](../apps/api/src/database/migrations/).
Seluruh tabel operasional memiliki kolom `tenant_id UUID NOT NULL` untuk isolasi multi-tenant.

Perintah dari `apps/api`:
```bash
npm run migration:run
```
