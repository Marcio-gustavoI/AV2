import { fork } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pino from 'pino';
import { executarLimpezaAuditoria } from '../../../scripts/limpar-auditoria.js';
import { buildApp } from '../../../src/app.js';
import { Papel } from '../../../src/domain/index.js';
import { prisma } from '../../../src/lib/prisma.js';
import {
  ID_USUARIO_TESTE_PADRAO,
  garantirUsuarioTesteNoBanco,
  gerarCabecalhoAuth,
  limparBanco,
} from '../../helpers/banco.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raizProjeto = path.resolve(__dirname, '..', '..', '..');

describe('Integração Fase 8: Acabamento Técnico (Retenção Auditoria, Triggers, Swagger, CORS, Paginação, Erros, Rotação de Log e Graceful Shutdown)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({
      corsOrigens: ['https://spa.greencode.com.br'],
    });
    await app.ready();
  });

  beforeEach(async () => {
    await limparBanco();
    await garantirUsuarioTesteNoBanco(ID_USUARIO_TESTE_PADRAO, Papel.ADMIN);
  });

  afterAll(async () => {
    await app.close();
  });

  it('trigger da Auditoria com variável nunca definida: bloqueia UPDATE e DELETE quando greencode.limpeza nunca foi definida ou está off', async () => {
    const idAud = '00000000-0000-0000-0000-000000000199';

    await prisma.$executeRawUnsafe(
      `INSERT INTO "auditorias" ("id", "usuario_id", "acao", "entidade", "entidade_id", "depois", "criado_em")
       VALUES ($1::uuid, $2::uuid, 'CRIAR', 'Organizacao', 'org-199', '{"teste":199}'::jsonb, NOW() - INTERVAL '200 days');`,
      idAud,
      ID_USUARIO_TESTE_PADRAO,
    );

    // 1. UPDATE direto na Auditoria é bloqueado pelo trigger
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "auditorias" SET "acao" = 'ADULTERADO' WHERE "id" = '${idAud}'::uuid;`,
      ),
    ).rejects.toThrow(/imutável|UPDATE/i);

    // 2. DELETE direto com a variável greencode.limpeza NUNCA definida na sessão (current_setting -> NULL) é bloqueado
    await expect(
      prisma.$executeRawUnsafe(
        `DELETE FROM "auditorias" WHERE "id" = '${idAud}'::uuid;`,
      ),
    ).rejects.toThrow(/DELETE não permitido sem autorização de limpeza/i);

    // 3. DELETE com greencode.limpeza = 'off' também é bloqueado
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL greencode.limpeza = 'off';");
        await tx.$executeRawUnsafe(
          `DELETE FROM "auditorias" WHERE "id" = '${idAud}'::uuid;`,
        );
      }),
    ).rejects.toThrow(/DELETE não permitido sem autorização de limpeza/i);
  });

  it('retenção de 180 dias: registro de 179 dias não é apagado, registro de 181 dias é apagado e valores < 180 são rejeitados', async () => {
    const id179Dias = '00000000-0000-0000-0000-000000000179';
    const id181Dias = '00000000-0000-0000-0000-000000000181';

    await prisma.$executeRawUnsafe(
      `INSERT INTO "auditorias" ("id", "usuario_id", "acao", "entidade", "entidade_id", "depois", "criado_em")
       VALUES ($1::uuid, $2::uuid, 'CRIAR', 'Organizacao', 'org-179', '{"teste":179}'::jsonb, NOW() - INTERVAL '179 days'),
              ($3::uuid, $2::uuid, 'CRIAR', 'Organizacao', 'org-181', '{"teste":181}'::jsonb, NOW() - INTERVAL '181 days');`,
      id179Dias,
      ID_USUARIO_TESTE_PADRAO,
      id181Dias,
    );

    // DELETE com greencode.limpeza = 'on' de registro com 179 dias é bloqueado pelo trigger
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL greencode.limpeza = 'on';");
        await tx.$executeRawUnsafe(
          `DELETE FROM "auditorias" WHERE "id" = '${id179Dias}'::uuid;`,
        );
      }),
    ).rejects.toThrow(/180 dias/i);

    // Script limpar-auditoria rejeita valores menores que 180 dias
    await expect(executarLimpezaAuditoria(179)).rejects.toThrow(/mínimo exigido.*180/i);

    // Script limpar-auditoria com 180 dias apaga o de 181 dias e mantém o de 179 dias
    const resultado = await executarLimpezaAuditoria(180);
    expect(resultado.removidos).toBe(1);

    const restantes = await prisma.auditoria.findMany();
    expect(restantes).toHaveLength(1);
    expect(restantes[0]?.id).toBe(id179Dias);
  });

  it('expõe documentação OpenAPI/Swagger em /docs e /docs/json com tags e bearerAuth', async () => {
    const resJson = await app.inject({
      method: 'GET',
      url: '/docs/json',
    });
    expect(resJson.statusCode).toBe(200);
    const spec = resJson.json();
    expect(spec.openapi).toMatch(/^3\.0/);
    expect(spec.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
    expect(spec.paths['/api/v1/organizacoes']).toBeDefined();
    expect(spec.paths['/api/v1/equipamentos/{id}/rastreabilidade']).toBeDefined();

    const resUi = await app.inject({
      method: 'GET',
      url: '/docs',
    });
    expect([200, 302]).toContain(resUi.statusCode);
  });

  it('CORS configurável por ambiente: permite origem listada em CORS_ORIGENS e bloqueia origem externa não autorizada (A2-20)', async () => {
    const corsPermitido = await app.inject({
      method: 'GET',
      url: '/saude',
      headers: {
        origin: 'https://spa.greencode.com.br',
      },
    });
    expect(corsPermitido.headers['access-control-allow-origin']).toBe(
      'https://spa.greencode.com.br',
    );

    const corsBloqueado = await app.inject({
      method: 'GET',
      url: '/saude',
      headers: {
        origin: 'https://malicioso.exemplo.com',
      },
    });
    expect(corsBloqueado.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('paginação com limite máximo: limita tamanhoPagina a 100 nas listagens da API', async () => {
    const resAud = await app.inject({
      method: 'GET',
      url: '/api/v1/auditoria?pagina=1&tamanhoPagina=100',
      headers: gerarCabecalhoAuth(app, Papel.AUDITOR),
    });
    expect(resAud.statusCode).toBe(200);
    expect(resAud.json().paginacao.tamanhoPagina).toBe(100);

    // Acima de 100 no query schema (maximum: 100) retorna 400 VALIDACAO_INVALIDA
    const resAcima100 = await app.inject({
      method: 'GET',
      url: '/api/v1/organizacoes?pagina=1&tamanhoPagina=500',
      headers: gerarCabecalhoAuth(app, Papel.AUDITOR),
    });
    expect(resAcima100.statusCode).toBe(400);
    expect(resAcima100.json().erro).toBe('VALIDACAO_INVALIDA');
  });

  it('formato padronizado de erro: 400 validação JSON Schema e 500 erro interno genérico (CRITICO) sem vazar stack trace ou SQL', async () => {
    const res400 = await app.inject({
      method: 'POST',
      url: '/api/v1/organizacoes',
      headers: gerarCabecalhoAuth(app, Papel.ADMIN),
      payload: {
        codigo: '',
      },
    });
    expect(res400.statusCode).toBe(400);
    const body400 = res400.json();
    expect(body400.erro).toBe('VALIDACAO_INVALIDA');
    expect(body400.severidade).toBe('AVISO');
    expect(Array.isArray(body400.detalhes)).toBe(true);

    const appComRotaFalha = await buildApp();
    appComRotaFalha.get('/api/v1/erro-500-teste', async () => {
      throw new Error('SELECT * FROM segredo_sql WHERE stack_trace = 1');
    });
    await appComRotaFalha.ready();

    const res500 = await appComRotaFalha.inject({
      method: 'GET',
      url: '/api/v1/erro-500-teste',
      headers: gerarCabecalhoAuth(appComRotaFalha, Papel.ADMIN),
    });
    expect(res500.statusCode).toBe(500);
    const body500 = res500.json();
    expect(body500.erro).toBe('ERRO_INTERNO');
    expect(body500.severidade).toBe('CRITICO');
    expect(res500.body).not.toContain('segredo_sql');
    expect(res500.body).not.toContain('stack_trace');

    await appComRotaFalha.close();
  });

  it('demonstra rotação de arquivo de log com pino-roll ao atingir o limite de tamanho (size)', async () => {
    const dirTemp = await fs.mkdtemp(path.join(os.tmpdir(), 'greencode-logs-test-'));
    const baseFile = path.join(dirTemp, 'app.log');

    const transport = pino.transport({
      target: 'pino-roll',
      options: {
        file: baseFile,
        size: '1k',
        mkdir: true,
      },
    });

    await new Promise<void>((resolve) => {
      transport.once('ready', () => resolve());
    });

    const logRotativo = pino({ level: 'info' }, transport);

    for (let lote = 0; lote < 6; lote++) {
      for (let i = 0; i < 10; i++) {
        logRotativo.info(
          { lote, iteracao: i, payload: 'X'.repeat(160) },
          'linha de teste para rotação por tamanho',
        );
      }
      await new Promise((r) => setTimeout(r, 60));
    }

    transport.end();
    await new Promise((r) => setTimeout(r, 400));

    const arquivos = await fs.readdir(dirTemp);
    expect(arquivos.length).toBeGreaterThanOrEqual(2);

    await fs.rm(dirTemp, { recursive: true, force: true });
  });

  it(
    'graceful shutdown: sobe servidor como processo filho, responde /saude e encerra com código 0 ao receber SIGINT',
    async () => {
      const portaTeste = 4400 + Math.floor(Math.random() * 500);
      const serverPath = path.join(raizProjeto, 'src', 'server.ts');

      const child = fork(serverPath, [], {
        cwd: raizProjeto,
        execArgv: ['--import', 'tsx'],
        env: {
          ...process.env,
          NODE_ENV: 'test',
          PORT: String(portaTeste),
          HOST: '127.0.0.1',
          LOG_LEVEL: 'info',
          JWT_SECRET: 'segredo-somente-para-testes-com-mais-de-32-caracteres',
          DATABASE_URL: 'postgresql://greencode:greencode@localhost:5433/greencode_test',
        },
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      });

      try {
        let stdoutAcumulado = '';
        child.stdout?.on('data', (chunk: Buffer) => {
          stdoutAcumulado += chunk.toString('utf8');
        });

        const subiu = await new Promise<boolean>((resolve) => {
          const limite = setTimeout(() => resolve(false), 10000);
          const intervalo = setInterval(async () => {
            try {
              const resp = await fetch(`http://127.0.0.1:${portaTeste}/saude`);
              if (resp.status === 200) {
                clearInterval(intervalo);
                clearTimeout(limite);
                resolve(true);
              }
            } catch {
              // servidor ainda iniciando
            }
          }, 150);
        });

        expect(subiu).toBe(true);

        child.send({ tipo: 'GREENCODE_SHUTDOWN_TEST', signal: 'SIGINT' });

        const codigoSaida = await new Promise<number | null>((resolve) => {
          const timer = setTimeout(() => {
            child.kill('SIGKILL');
            resolve(null);
          }, 8000);
          child.once('exit', (code) => {
            clearTimeout(timer);
            resolve(code);
          });
        });

        expect(codigoSaida).toBe(0);
        expect(stdoutAcumulado).toContain('Servidor e conexões encerrados com sucesso');
      } finally {
        if (child.exitCode === null) {
          child.kill('SIGKILL');
        }
      }
    },
    20000,
  );

  // Justificativa explícita (seção 13): no Windows, child.kill('SIGTERM') invoca TerminateProcess(),
  // que mata o processo imediatamente sem disparar handlers de sinal POSIX no Node.js.
  // Este teste roda nativamente no Linux/macOS (CI Ubuntu) e fica registrado como skipped no Windows.
  it.skipIf(process.platform === 'win32')(
    'graceful shutdown via sinal POSIX SIGTERM nativo (executado em Linux/macOS; pulado no Windows pois TerminateProcess não dispara handler JS)',
    async () => {
      const portaTeste = 4390;
      const serverPath = path.join(raizProjeto, 'src', 'server.ts');

      const child = fork(serverPath, [], {
        cwd: raizProjeto,
        execArgv: ['--import', 'tsx'],
        env: {
          ...process.env,
          NODE_ENV: 'test',
          PORT: String(portaTeste),
          HOST: '127.0.0.1',
          LOG_LEVEL: 'info',
          JWT_SECRET: 'segredo-somente-para-testes-com-mais-de-32-caracteres',
          DATABASE_URL: 'postgresql://greencode:greencode@localhost:5433/greencode_test',
        },
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      });

      const subiu = await new Promise<boolean>((resolve) => {
        const limite = setTimeout(() => resolve(false), 7000);
        const intervalo = setInterval(async () => {
          try {
            const resp = await fetch(`http://127.0.0.1:${portaTeste}/saude`);
            if (resp.status === 200) {
              clearInterval(intervalo);
              clearTimeout(limite);
              resolve(true);
            }
          } catch {
            // aguardando boot
          }
        }, 150);
      });
      expect(subiu).toBe(true);

      child.kill('SIGTERM');

      const codigoSaida = await new Promise<number | null>((resolve) => {
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          resolve(null);
        }, 5000);
        child.once('exit', (code) => {
          clearTimeout(timer);
          resolve(code);
        });
      });

      expect(codigoSaida).toBe(0);
    },
  );
});
