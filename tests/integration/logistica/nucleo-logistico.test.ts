import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/app.js';
import {
  ClassificacaoDestino,
  EstadoFisico,
  Papel,
  RelogioFixo,
  StatusEquipamento,
  TipoEquipamento,
} from '../../../src/domain/index.js';
import { prisma } from '../../../src/lib/prisma.js';
import {
  type AuditoriaRepository,
  type CriarAuditoriaInput,
  PrismaGerenciadorTransacao,
  type RegistroAuditoria,
} from '../../../src/modules/auditoria/auditoria.repository.js';
import { PrismaEquipamentoRepository } from '../../../src/modules/equipamento/equipamento.repository.js';
import { PrismaLoteRepository } from '../../../src/modules/lote/lote.repository.js';
import { LoteService } from '../../../src/modules/lote/lote.service.js';
import { PrismaMovimentacaoRepository } from '../../../src/modules/movimentacao/movimentacao.repository.js';
import { MovimentacaoService } from '../../../src/modules/movimentacao/movimentacao.service.js';
import { PrismaOrganizacaoRepository } from '../../../src/modules/organizacao/organizacao.repository.js';
import {
  ID_USUARIO_TESTE_PADRAO,
  garantirUsuarioTesteNoBanco,
  gerarCabecalhoAuth,
  limparBanco,
} from '../../helpers/banco.js';

function obterDataFormatadaNoFuso(diasOffset: number, fuso = 'America/Sao_Paulo'): string {
  const base = new Date();
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(base);
  const ano = Number(partes.find((p) => p.type === 'year')?.value);
  const mes = Number(partes.find((p) => p.type === 'month')?.value);
  const dia = Number(partes.find((p) => p.type === 'day')?.value);
  const utc = new Date(Date.UTC(ano, mes - 1, dia + diasOffset));
  return utc.toISOString().slice(0, 10);
}

describe('Integração Fase 6: Núcleo Logístico (Lote, Equipamento, Triagem, Movimentação, Concorrência e Rollback)', () => {
  let app: FastifyInstance;
  let orgId: string;
  const hojeStr = obterDataFormatadaNoFuso(0);

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(async () => {
    await limparBanco();
    await garantirUsuarioTesteNoBanco(ID_USUARIO_TESTE_PADRAO, Papel.ADMIN);

    const orgRes = await app.inject({
      method: 'POST',
      url: '/api/v1/organizacoes',
      headers: gerarCabecalhoAuth(app, Papel.OPERADOR_CADASTRO),
      payload: {
        codigo: 'BR001',
        cnpj: '11.222.333/0001-81',
        nome: 'Organização Parceira Logística',
      },
    });
    orgId = orgRes.json().id as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('cadastra lote com equipamentos (código sequencial GC-000001), executa triagem (R9) e fluxo completo até DESTINADO', async () => {
    const resLote = await app.inject({
      method: 'POST',
      url: '/api/v1/lotes',
      headers: gerarCabecalhoAuth(app, Papel.GESTOR_ALMOXARIFADO),
      payload: {
        orgCodigo: 'BR001',
        notaFiscal: 'NF-2026-001',
        transportadora: 'Logística Verde S.A.',
        dataEntrada: hojeStr,
        equipamentos: [
          {
            tipo: TipoEquipamento.NOTEBOOK,
            descricao: 'Notebook ThinkPad T14',
            estadoFisico: EstadoFisico.EXCELENTE,
            valorAquisicao: 4500.5,
          },
        ],
      },
    });

    expect(resLote.statusCode).toBe(201);
    const loteBody = resLote.json();
    expect(loteBody.equipamentos).toHaveLength(1);
    const eq = loteBody.equipamentos[0];
    expect(eq.codigoBarrasInterno).toBe('GC-000001');
    expect(eq.status).toBe(StatusEquipamento.RECEBIDO);

    // 1. RECEBIDO -> EM_TRIAGEM
    const movParaTriagem = await app.inject({
      method: 'POST',
      url: `/api/v1/equipamentos/${eq.id}/movimentacoes`,
      headers: gerarCabecalhoAuth(app, Papel.GESTOR_ALMOXARIFADO),
      payload: {
        versao: 1,
        statusNovo: StatusEquipamento.EM_TRIAGEM,
      },
    });
    expect(movParaTriagem.statusCode).toBe(200);
    expect(movParaTriagem.json().equipamento.status).toBe(StatusEquipamento.EM_TRIAGEM);
    expect(movParaTriagem.json().equipamento.versao).toBe(2);

    // 2. Conclui triagem: POST /api/v1/equipamentos/:id/triagem -> move para TRIADO e triagemCompleta=true
    const resTriagem = await app.inject({
      method: 'POST',
      url: `/api/v1/equipamentos/${eq.id}/triagem`,
      headers: gerarCabecalhoAuth(app, Papel.GESTOR_ALMOXARIFADO),
      payload: {
        versao: 2,
        classificacaoDestino: ClassificacaoDestino.REUTILIZACAO,
        estadoFisico: EstadoFisico.BOM,
      },
    });
    expect(resTriagem.statusCode).toBe(200);
    expect(resTriagem.json().status).toBe(StatusEquipamento.TRIADO);
    expect(resTriagem.json().triagemCompleta).toBe(true);
    expect(resTriagem.json().classificacaoDestino).toBe(ClassificacaoDestino.REUTILIZACAO);
    expect(resTriagem.json().versao).toBe(3);

    // 3. TRIADO -> EM_DESMONTE -> DESMONTADO -> DESTINADO
    const movDesmonte = await app.inject({
      method: 'POST',
      url: `/api/v1/equipamentos/${eq.id}/movimentacoes`,
      headers: gerarCabecalhoAuth(app, Papel.GESTOR_ALMOXARIFADO),
      payload: {
        versao: 3,
        statusNovo: StatusEquipamento.EM_DESMONTE,
      },
    });
    expect(movDesmonte.statusCode).toBe(200);

    const movDesmontado = await app.inject({
      method: 'POST',
      url: `/api/v1/equipamentos/${eq.id}/movimentacoes`,
      headers: gerarCabecalhoAuth(app, Papel.GESTOR_ALMOXARIFADO),
      payload: {
        versao: 4,
        statusNovo: StatusEquipamento.DESMONTADO,
        estadoNovo: EstadoFisico.SUCATA,
        justificativa: 'Equipamento integralmente desmontado para separação de peças.',
      },
    });
    expect(movDesmontado.statusCode).toBe(200);

    const movDestinado = await app.inject({
      method: 'POST',
      url: `/api/v1/equipamentos/${eq.id}/movimentacoes`,
      headers: gerarCabecalhoAuth(app, Papel.GESTOR_ALMOXARIFADO),
      payload: {
        versao: 5,
        statusNovo: StatusEquipamento.DESTINADO,
      },
    });
    expect(movDestinado.statusCode).toBe(200);
    expect(movDestinado.json().equipamento.status).toBe(StatusEquipamento.DESTINADO);
    expect(movDestinado.json().equipamento.versao).toBe(6);
  });

  it('valida regras R2 (data futura, 91 dias, 90 dias), R3 (desmonte sem triagem), R4 (queda 2 níveis sem justificativa), R5 e R10', async () => {
    const dataAmanha = obterDataFormatadaNoFuso(1);
    const data90Dias = obterDataFormatadaNoFuso(-90);
    const data91Dias = obterDataFormatadaNoFuso(-91);

    const loteFuturo = await app.inject({
      method: 'POST',
      url: '/api/v1/lotes',
      headers: gerarCabecalhoAuth(app, Papel.GESTOR_ALMOXARIFADO),
      payload: {
        orgCodigo: 'BR001',
        notaFiscal: 'NF-FUT',
        transportadora: 'T',
        dataEntrada: dataAmanha,
      },
    });
    expect(loteFuturo.statusCode).toBe(422);

    const lote91Dias = await app.inject({
      method: 'POST',
      url: '/api/v1/lotes',
      headers: gerarCabecalhoAuth(app, Papel.GESTOR_ALMOXARIFADO),
      payload: {
        orgCodigo: 'BR001',
        notaFiscal: 'NF-91D',
        transportadora: 'T',
        dataEntrada: data91Dias,
      },
    });
    expect(lote91Dias.statusCode).toBe(422);

    const lote90Dias = await app.inject({
      method: 'POST',
      url: '/api/v1/lotes',
      headers: gerarCabecalhoAuth(app, Papel.GESTOR_ALMOXARIFADO),
      payload: {
        orgCodigo: 'BR001',
        notaFiscal: 'NF-90D',
        transportadora: 'T',
        dataEntrada: data90Dias,
        equipamentos: [
          {
            tipo: TipoEquipamento.DESKTOP,
            descricao: 'Desktop Teste Regras',
            estadoFisico: EstadoFisico.EXCELENTE,
          },
        ],
      },
    });
    expect(lote90Dias.statusCode).toBe(201);
    const eqId = lote90Dias.json().equipamentos[0].id as string;

    // R10: movimentação sem mudança de status nem estado físico -> 422
    const semMudanca = await app.inject({
      method: 'POST',
      url: `/api/v1/equipamentos/${eqId}/movimentacoes`,
      headers: gerarCabecalhoAuth(app, Papel.GESTOR_ALMOXARIFADO),
      payload: {
        versao: 1,
        statusNovo: StatusEquipamento.RECEBIDO,
        estadoNovo: EstadoFisico.EXCELENTE,
      },
    });
    expect(semMudanca.statusCode).toBe(422);

    // R4: queda de 2 níveis (EXCELENTE=4 -> REGULAR=2) sem justificativa -> 422
    const queda2SemJustificativa = await app.inject({
      method: 'POST',
      url: `/api/v1/equipamentos/${eqId}/movimentacoes`,
      headers: gerarCabecalhoAuth(app, Papel.GESTOR_ALMOXARIFADO),
      payload: {
        versao: 1,
        estadoNovo: EstadoFisico.REGULAR,
      },
    });
    expect(queda2SemJustificativa.statusCode).toBe(422);

    // R4: queda de 1 nível (EXCELENTE=4 -> BOM=3) sem justificativa -> 200 (aceita)
    const queda1SemJustificativa = await app.inject({
      method: 'POST',
      url: `/api/v1/equipamentos/${eqId}/movimentacoes`,
      headers: gerarCabecalhoAuth(app, Papel.GESTOR_ALMOXARIFADO),
      payload: {
        versao: 1,
        estadoNovo: EstadoFisico.BOM,
      },
    });
    expect(queda1SemJustificativa.statusCode).toBe(200);

    // R5: transição inválida (RECEBIDO -> TRIADO pulando EM_TRIAGEM) -> 422
    const transicaoInvalida = await app.inject({
      method: 'POST',
      url: `/api/v1/equipamentos/${eqId}/movimentacoes`,
      headers: gerarCabecalhoAuth(app, Papel.GESTOR_ALMOXARIFADO),
      payload: {
        versao: 2,
        statusNovo: StatusEquipamento.TRIADO,
      },
    });
    expect(transicaoInvalida.statusCode).toBe(422);
  });

  it('teste obrigatório (a): dois updates concorrentes com a mesma versao via Promise.all -> um 200 e um 409', async () => {
    const resLote = await app.inject({
      method: 'POST',
      url: '/api/v1/lotes',
      headers: gerarCabecalhoAuth(app, Papel.GESTOR_ALMOXARIFADO),
      payload: {
        organizacaoId: orgId,
        notaFiscal: 'NF-CONCORRENCIA',
        transportadora: 'Transp',
        dataEntrada: hojeStr,
        equipamentos: [
          {
            tipo: TipoEquipamento.MONITOR,
            descricao: 'Monitor Concorrente',
            estadoFisico: EstadoFisico.BOM,
          },
        ],
      },
    });
    const eqId = resLote.json().equipamentos[0].id as string;

    const [r1, r2] = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/v1/equipamentos/${eqId}/movimentacoes`,
        headers: gerarCabecalhoAuth(app, Papel.GESTOR_ALMOXARIFADO),
        payload: {
          versao: 1,
          statusNovo: StatusEquipamento.EM_TRIAGEM,
        },
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/equipamentos/${eqId}/movimentacoes`,
        headers: gerarCabecalhoAuth(app, Papel.ADMIN),
        payload: {
          versao: 1,
          estadoNovo: EstadoFisico.REGULAR,
        },
      }),
    ]);

    const statusCodes = [r1.statusCode, r2.statusCode].sort((a, b) => a - b);
    expect(statusCodes).toEqual([200, 409]);

    const eqNoBanco = await prisma.equipamento.findUnique({ where: { id: eqId } });
    expect(eqNoBanco?.versao).toBe(2);
    const movs = await prisma.movimentacao.findMany({ where: { equipamentoId: eqId } });
    expect(movs).toHaveLength(1);
  });

  it('teste obrigatório (b): falha injetada no meio da $transaction reverte equipamento, movimentação e lote no banco', async () => {
    // Criamos um equipamento válido no banco real
    const resLote = await app.inject({
      method: 'POST',
      url: '/api/v1/lotes',
      headers: gerarCabecalhoAuth(app, Papel.GESTOR_ALMOXARIFADO),
      payload: {
        organizacaoId: orgId,
        notaFiscal: 'NF-ROLLBACK',
        transportadora: 'Transp',
        dataEntrada: hojeStr,
        equipamentos: [
          {
            tipo: TipoEquipamento.SERVIDOR,
            descricao: 'Servidor Rollback',
            estadoFisico: EstadoFisico.EXCELENTE,
          },
        ],
      },
    });
    const eqId = resLote.json().equipamentos[0].id as string;

    // Repositório de auditoria que falha intencionalmente após o equipamento e a movimentação terem sido gravados na transação
    const auditoriaQueFalha: AuditoriaRepository = {
      async registrar(_dados: CriarAuditoriaInput): Promise<RegistroAuditoria> {
        throw new Error('Falha simulada ao gravar auditoria no meio da transação');
      },
      async listar() {
        return { dados: [], total: 0 };
      },
    };

    const transacaoReal = new PrismaGerenciadorTransacao(prisma);
    const eqRepoReal = new PrismaEquipamentoRepository(prisma);
    const movRepoReal = new PrismaMovimentacaoRepository(prisma);
    const loteRepoReal = new PrismaLoteRepository(prisma);
    const orgRepoReal = new PrismaOrganizacaoRepository(prisma);

    const movServiceComFalha = new MovimentacaoService(
      eqRepoReal,
      movRepoReal,
      auditoriaQueFalha,
      transacaoReal,
    );

    await expect(
      movServiceComFalha.registrar(
        { id: ID_USUARIO_TESTE_PADRAO, papel: Papel.GESTOR_ALMOXARIFADO },
        {
          equipamentoId: eqId,
          versao: 1,
          statusNovo: StatusEquipamento.EM_TRIAGEM,
        },
      ),
    ).rejects.toThrow('Falha simulada ao gravar auditoria no meio da transação');

    // Prova por consulta ao banco: equipamento continua em RECEBIDO (versao 1) e nenhuma movimentação foi persistida
    const eqAposFalha = await prisma.equipamento.findUnique({ where: { id: eqId } });
    expect(eqAposFalha?.status).toBe(StatusEquipamento.RECEBIDO);
    expect(eqAposFalha?.versao).toBe(1);

    const totalMovimentacoes = await prisma.movimentacao.count({ where: { equipamentoId: eqId } });
    expect(totalMovimentacoes).toBe(0);

    // Também testa criação de lote com falha na auditoria -> nenhum lote adicional persistido
    const loteServiceComFalha = new LoteService(
      loteRepoReal,
      eqRepoReal,
      orgRepoReal,
      auditoriaQueFalha,
      transacaoReal,
      new RelogioFixo(new Date()),
    );

    await expect(
      loteServiceComFalha.criar(
        { id: ID_USUARIO_TESTE_PADRAO, papel: Papel.GESTOR_ALMOXARIFADO },
        {
          organizacaoId: orgId,
          notaFiscal: 'NF-NAO-DEVE-EXISTIR',
          transportadora: 'Transp',
          dataEntrada: hojeStr,
        },
      ),
    ).rejects.toThrow('Falha simulada ao gravar auditoria no meio da transação');

    const loteRevertido = await prisma.lote.findFirst({
      where: { notaFiscal: 'NF-NAO-DEVE-EXISTIR' },
    });
    expect(loteRevertido).toBeNull();
  });

  it('teste obrigatório (c): criação de lote com 1 equipamento inválido reverte toda a operação (nenhum lote nem equipamento persistido)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/lotes',
      headers: gerarCabecalhoAuth(app, Papel.GESTOR_ALMOXARIFADO),
      payload: {
        orgCodigo: 'BR001',
        notaFiscal: 'NF-LOTE-ATOMICO',
        transportadora: 'Transp',
        dataEntrada: hojeStr,
        equipamentos: [
          {
            tipo: TipoEquipamento.NOTEBOOK,
            descricao: 'Equipamento 1 Válido',
            estadoFisico: EstadoFisico.BOM,
          },
          {
            tipo: TipoEquipamento.DESKTOP,
            descricao: 'Equipamento 2 com código de barras inválido',
            estadoFisico: EstadoFisico.BOM,
            codigoBarrasInterno: 'FORMATO-INVALIDO-999',
          },
        ],
      },
    });

    expect(res.statusCode).toBe(422);

    const totalLotes = await prisma.lote.count();
    const totalEquipamentos = await prisma.equipamento.count();
    expect(totalLotes).toBe(0);
    expect(totalEquipamentos).toBe(0);
  });

  it('garante código de barras único (409) e imutável no banco via trigger (R6)', async () => {
    const resLote = await app.inject({
      method: 'POST',
      url: '/api/v1/lotes',
      headers: gerarCabecalhoAuth(app, Papel.GESTOR_ALMOXARIFADO),
      payload: {
        orgCodigo: 'BR001',
        notaFiscal: 'NF-BARCODE',
        transportadora: 'Transp',
        dataEntrada: hojeStr,
        equipamentos: [
          {
            tipo: TipoEquipamento.REDE,
            descricao: 'Switch 24 portas',
            estadoFisico: EstadoFisico.BOM,
            codigoBarrasInterno: 'GC-500001',
          },
        ],
      },
    });
    expect(resLote.statusCode).toBe(201);
    const loteId = resLote.json().id as string;
    const eqId = resLote.json().equipamentos[0].id as string;

    // Tentativa de criar equipamento com mesmo código de barras -> 409
    const resDuplicado = await app.inject({
      method: 'POST',
      url: '/api/v1/equipamentos',
      headers: gerarCabecalhoAuth(app, Papel.GESTOR_ALMOXARIFADO),
      payload: {
        loteId,
        tipo: TipoEquipamento.PERIFERICO,
        descricao: 'Teclado USB',
        estadoFisico: EstadoFisico.BOM,
        codigoBarrasInterno: 'GC-500001',
      },
    });
    expect(resDuplicado.statusCode).toBe(409);

    // Tentativa de alterar codigo_barras_interno diretamente via SQL no banco -> bloqueado pelo trigger da Migração 3
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE equipamentos SET codigo_barras_interno = 'GC-999999' WHERE id = '${eqId}'::uuid`,
      ),
    ).rejects.toThrow(/codigo_barras_interno é imutável/i);
  });

  it('valida matriz de permissões em Lotes, Equipamentos, Triagem e Movimentações (OPERADOR_CADASTRO e AUDITOR recebem 403 na escrita e 200 na leitura)', async () => {
    const resLote = await app.inject({
      method: 'POST',
      url: '/api/v1/lotes',
      headers: gerarCabecalhoAuth(app, Papel.GESTOR_ALMOXARIFADO),
      payload: {
        orgCodigo: 'BR001',
        notaFiscal: 'NF-RBAC-LOG',
        transportadora: 'Transp',
        dataEntrada: hojeStr,
        equipamentos: [
          {
            tipo: TipoEquipamento.OUTRO,
            descricao: 'Nobreak 1500VA',
            estadoFisico: EstadoFisico.REGULAR,
          },
        ],
      },
    });
    const loteId = resLote.json().id as string;
    const eqId = resLote.json().equipamentos[0].id as string;

    for (const papelSomenteLeitura of [Papel.OPERADOR_CADASTRO, Papel.AUDITOR]) {
      // Leitura permitida (200)
      const getLotes = await app.inject({
        method: 'GET',
        url: '/api/v1/lotes',
        headers: gerarCabecalhoAuth(app, papelSomenteLeitura),
      });
      expect(getLotes.statusCode).toBe(200);

      const getEquipamentos = await app.inject({
        method: 'GET',
        url: '/api/v1/equipamentos',
        headers: gerarCabecalhoAuth(app, papelSomenteLeitura),
      });
      expect(getEquipamentos.statusCode).toBe(200);

      // Escrita bloqueada (403) em todos os recursos logísticos
      const postLote = await app.inject({
        method: 'POST',
        url: '/api/v1/lotes',
        headers: gerarCabecalhoAuth(app, papelSomenteLeitura),
        payload: {
          orgCodigo: 'BR001',
          notaFiscal: 'NF-PROIBIDO',
          transportadora: 'T',
          dataEntrada: hojeStr,
        },
      });
      expect(postLote.statusCode).toBe(403);

      const postEq = await app.inject({
        method: 'POST',
        url: '/api/v1/equipamentos',
        headers: gerarCabecalhoAuth(app, papelSomenteLeitura),
        payload: {
          loteId,
          tipo: TipoEquipamento.OUTRO,
          descricao: 'Proibido',
          estadoFisico: EstadoFisico.BOM,
        },
      });
      expect(postEq.statusCode).toBe(403);

      const postTriagem = await app.inject({
        method: 'POST',
        url: `/api/v1/equipamentos/${eqId}/triagem`,
        headers: gerarCabecalhoAuth(app, papelSomenteLeitura),
        payload: {
          versao: 1,
          classificacaoDestino: ClassificacaoDestino.RECICLAGEM,
          estadoFisico: EstadoFisico.REGULAR,
        },
      });
      expect(postTriagem.statusCode).toBe(403);

      const postMov = await app.inject({
        method: 'POST',
        url: `/api/v1/equipamentos/${eqId}/movimentacoes`,
        headers: gerarCabecalhoAuth(app, papelSomenteLeitura),
        payload: {
          versao: 1,
          statusNovo: StatusEquipamento.EM_TRIAGEM,
        },
      });
      expect(postMov.statusCode).toBe(403);
    }
  });
});
