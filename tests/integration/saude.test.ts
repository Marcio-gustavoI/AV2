import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';

describe('GET /saude', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Set required env vars for tests
    process.env['DATABASE_URL'] = process.env['DATABASE_URL'] ?? 'postgresql://test:test@localhost:5432/test';
    process.env['JWT_SECRET'] = process.env['JWT_SECRET'] ?? 'test-secret-with-minimum-32-characters-here';
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('retorna status ok e timestamp', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/saude',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ status: string; timestamp: string; versao: string }>();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.versao).toBe('1.0.0');
  });

  it('retorna 404 para rotas inexistentes', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/rota-inexistente',
    });

    expect(response.statusCode).toBe(404);
    const body = response.json<{ erro: string; severidade: string }>();
    expect(body.erro).toBe('ROTA_NAO_ENCONTRADA');
    expect(body.severidade).toBe('AVISO');
  });
});
