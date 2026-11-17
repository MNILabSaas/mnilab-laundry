import { existsSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { buildLaundryDataSourceOptions } from './database.config.js';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

export default new DataSource(buildLaundryDataSourceOptions(process.env));
