import { describe, expect, it } from 'vitest';
import app from './index';

describe('API foundation', () => {
  it('returns a healthy service response', async () => {
    const response = await app.request('/api/v1/health', undefined, {
      ENVIRONMENT: 'test',
      API_VERSION: 'v1',
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      service: 'nutrition-center-api',
      environment: 'test',
      version: 'v1',
    });
  });
});
