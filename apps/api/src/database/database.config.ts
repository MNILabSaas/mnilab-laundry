import { fileURLToPath } from 'node:url';
import type { DataSourceOptions } from 'typeorm';
import { LAUNDRY_ENTITIES } from './entities.js';

const migrationsDir = fileURLToPath(
  new URL('./migrations/*.js', import.meta.url),
);

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Environment variable ${key} wajib diisi`);
  return value;
}

/** Konfigurasi TypeORM khusus database produk Laundry (`mnilab_laundry`). */
export function buildLaundryDataSourceOptions(
  env: NodeJS.ProcessEnv = process.env,
): DataSourceOptions {
  return {
    type: 'postgres',
    host: required(env, 'DB_HOST'),
    port: Number(env.DB_PORT?.trim() || 5432),
    username: required(env, 'DB_USERNAME'),
    password: env.DB_PASSWORD?.trim() ?? '',
    database: env.DB_DATABASE?.trim() || 'mnilab_laundry',
    entities: LAUNDRY_ENTITIES,
    migrations: [migrationsDir],
    migrationsTableName: 'typeorm_migrations',
    uuidExtension: 'pgcrypto',
    synchronize: false,
    migrationsRun: env.DB_MIGRATIONS_RUN?.trim() === 'true',
    logging: env.DB_LOGGING?.trim() === 'true' ? 'all' : ['error', 'warn'],
  };
}
