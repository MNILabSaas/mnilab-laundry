import { Controller, Get, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Public } from '../common/auth/auth.decorators.js';

@Controller('health')
@Public()
export class HealthController {
  constructor(@Optional() private readonly dataSource?: DataSource) {}

  @Get()
  async check() {
    let dbStatus: 'up' | 'down' | 'not_configured' = 'not_configured';
    if (this.dataSource?.isInitialized) {
      try {
        await this.dataSource.query('SELECT 1');
        dbStatus = 'up';
      } catch {
        dbStatus = 'down';
      }
    }
    return {
      status: dbStatus === 'down' ? 'degraded' : 'ok',
      service: 'mnilab-laundry-api',
      database: dbStatus,
      timestamp: new Date().toISOString(),
    };
  }
}
