import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller.js';

describe('HealthController (mnilab-laundry-api)', () => {
  it('mengembalikan status ok saat database belum diinisialisasi di unit test', async () => {
    const controller = new HealthController();
    const res = await controller.check();
    expect(res.status).toBe('ok');
    expect(res.service).toBe('mnilab-laundry-api');
    expect(res.database).toBe('not_configured');
  });
});
