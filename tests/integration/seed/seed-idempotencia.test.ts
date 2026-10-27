import { beforeEach, describe, expect, it } from 'vitest';
import { executarSeed } from '../../../prisma/seed.js';
import { limparBanco } from '../../helpers/banco.js';

describe('Integração Fase 9: Seed Idempotente e Proteção de Ambiente', () => {
  beforeEach(async () => {
    await limparBanco();
  });

  it('seed recusa rodar com NODE_ENV=production', async () => {
    await expect(executarSeed('production')).rejects.toThrow(/NODE_ENV=production/i);
  });

  it('seed idempotente: rodar duas vezes seguidas produz contagens idênticas sem duplicar nem falhar', async () => {
    const primeiraExecucao = await executarSeed('test');
    const segundaExecucao = await executarSeed('test');

    expect(primeiraExecucao).toEqual(segundaExecucao);
    expect(segundaExecucao.usuarios).toBe(4);
    expect(segundaExecucao.parametros).toBe(8);
    expect(segundaExecucao.organizacoes).toBe(4);
    expect(segundaExecucao.contratos).toBe(2);
    expect(segundaExecucao.lotes).toBe(3);
    expect(segundaExecucao.equipamentos).toBe(7);
    expect(segundaExecucao.movimentacoes).toBe(2);
    expect(segundaExecucao.auditorias).toBe(2);
  });
});
