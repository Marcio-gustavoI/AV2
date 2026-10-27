import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/app.js';
import {
  ClassificacaoDestino,
  EstadoFisico,
  Papel,
  StatusEquipamento,
  TipoEquipamento,
} from '../../../src/domain/index.js';
import {
  ID_USUARIO_TESTE_PADRAO,
  garantirUsuarioTesteNoBanco,
  gerarCabecalhoAuth,
  limparBanco,
} from '../../helpers/banco.js';

function obterHojeFormatado(): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const ano = partes.find((p) => p.type === 'year')?.value;
  const mes = partes.find((p) => p.type === 'month')?.value;
  const dia = partes.find((p) => p.type === 'day')?.value;
  return `${ano}-${mes}-${dia}`;
}

describe('Integração Fase 7: Auditoria, Rastreabilidade e Relatórios (Resumo e Financeiro R8)', () => {
  let app: FastifyInstance;
  const hojeStr = obterHojeFormatado();

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(async () => {
    await limparBanco();
    await garantirUsuarioTesteNoBanco(ID_USUARIO_TESTE_PADRAO, Papel.ADMIN, 'admin@greencode.local');
  });

  afterAll(async () => {
    await app.close();
  });

  it('retorna rastreabilidade completa do equipamento em ordem cronológica com usuário responsável para todos os 4 papéis', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/organizacoes',
      headers: gerarCabecalhoAuth(app, Papel.OPERADOR_CADASTRO),
      payload: {
        codigo: 'ORG-RASTRO',
        cnpj: '11.222.333/0001-81',
        nome: 'Org Rastreabilidade',
      },
    });

    const loteRes = await app.inject({
      method: 'POST',
      url: '/api/v1/lotes',
      headers: gerarCabecalhoAuth(app, Papel.GESTOR_ALMOXARIFADO),
      payload: {
        orgCodigo: 'ORG-RASTRO',
        notaFiscal: 'NF-RASTRO-01',
        transportadora: 'Transp Rastro',
        dataEntrada: hojeStr,
        equipamentos: [
          {
            tipo: TipoEquipamento.NOTEBOOK,
            descricao: 'Notebook Rastreável',
            estadoFisico: EstadoFisico.EXCELENTE,
            valorAquisicao: 3000,
          },
        ],
      },
    });
    const eqId = loteRes.json().equipamentos[0].id as string;

    // Movimentação 1: RECEBIDO -> EM_TRIAGEM
    await app.inject({
      method: 'POST',
      url: `/api/v1/equipamentos/${eqId}/movimentacoes`,
      headers: gerarCabecalhoAuth(app, Papel.GESTOR_ALMOXARIFADO),
      payload: {
        versao: 1,
        statusNovo: StatusEquipamento.EM_TRIAGEM,
      },
    });

    // Movimentação 2 (via Triagem): EM_TRIAGEM -> TRIADO
    await app.inject({
      method: 'POST',
      url: `/api/v1/equipamentos/${eqId}/triagem`,
      headers: gerarCabecalhoAuth(app, Papel.GESTOR_ALMOXARIFADO),
      payload: {
        versao: 2,
        classificacaoDestino: ClassificacaoDestino.REUTILIZACAO,
        estadoFisico: EstadoFisico.BOM,
      },
    });

    // Movimentação 3: TRIADO -> EM_DESMONTE
    await app.inject({
      method: 'POST',
      url: `/api/v1/equipamentos/${eqId}/movimentacoes`,
      headers: gerarCabecalhoAuth(app, Papel.ADMIN),
      payload: {
        versao: 3,
        statusNovo: StatusEquipamento.EM_DESMONTE,
      },
    });

    // Todos os 4 papéis têm leitura em /equipamentos/:id/rastreabilidade
    for (const papel of [
      Papel.ADMIN,
      Papel.OPERADOR_CADASTRO,
      Papel.GESTOR_ALMOXARIFADO,
      Papel.AUDITOR,
    ]) {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/equipamentos/${eqId}/rastreabilidade`,
        headers: gerarCabecalhoAuth(app, papel),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.equipamento.id).toBe(eqId);
      expect(body.lote.notaFiscal).toBe('NF-RASTRO-01');
      expect(body.organizacao.codigo).toBe('ORG-RASTRO');
      expect(body.movimentacoes).toHaveLength(3);
      expect(body.movimentacoes[0].statusNovo).toBe(StatusEquipamento.EM_TRIAGEM);
      expect(body.movimentacoes[1].statusNovo).toBe(StatusEquipamento.TRIADO);
      expect(body.movimentacoes[2].statusNovo).toBe(StatusEquipamento.EM_DESMONTE);
      expect(body.movimentacoes[0].usuario.email).toBe('admin@greencode.local');
    }
  });

  it('consulta auditoria filtrando por usuário, entidade, ação e intervalo de datas, e valida relatórios resumo e financeiro (R8)', async () => {
    // Define parâmetros financeiros (ADMIN)
    await app.inject({
      method: 'PUT',
      url: '/api/v1/parametros',
      headers: gerarCabecalhoAuth(app, Papel.ADMIN),
      payload: {
        parametros: [
          { chave: 'ALIQUOTA_IMPOSTO', valor: '0.10' },
          { chave: 'COEF_DEPRECIACAO_DESKTOP', valor: '0.40' },
          { chave: 'COEF_DEPRECIACAO_MONITOR', valor: '0.50' },
        ],
      },
    });

    const orgRes = await app.inject({
      method: 'POST',
      url: '/api/v1/organizacoes',
      headers: gerarCabecalhoAuth(app, Papel.OPERADOR_CADASTRO),
      payload: {
        codigo: 'ORG-FIN',
        cnpj: '12.ABC.345/01DE-35',
        nome: 'Org Relatórios',
      },
    });
    const orgId = orgRes.json().id as string;

    await app.inject({
      method: 'POST',
      url: '/api/v1/lotes',
      headers: gerarCabecalhoAuth(app, Papel.GESTOR_ALMOXARIFADO),
      payload: {
        organizacaoId: orgId,
        notaFiscal: 'NF-REL-01',
        transportadora: 'Transp Rel',
        dataEntrada: hojeStr,
        equipamentos: [
          {
            // Desktop: 1000.00 * (1 - 0.40) = 600.00; imposto = 600.00 * 0.10 = 60.00
            tipo: TipoEquipamento.DESKTOP,
            descricao: 'Desktop Financeiro',
            estadoFisico: EstadoFisico.BOM,
            valorAquisicao: '1000.00',
          },
          {
            // Monitor: 500.00 * (1 - 0.50) = 250.00; imposto = 250.00 * 0.10 = 25.00
            tipo: TipoEquipamento.MONITOR,
            descricao: 'Monitor Financeiro',
            estadoFisico: EstadoFisico.REGULAR,
            valorAquisicao: '500.00',
          },
          {
            // Sem valorAquisicao -> contado à parte
            tipo: TipoEquipamento.PERIFERICO,
            descricao: 'Cabo HDMI sem valor',
            estadoFisico: EstadoFisico.SUCATA,
          },
        ],
      },
    });

    // Relatório Resumo (AUDITOR)
    const resResumo = await app.inject({
      method: 'GET',
      url: `/api/v1/relatorios/resumo?organizacaoId=${orgId}`,
      headers: gerarCabecalhoAuth(app, Papel.AUDITOR),
    });
    expect(resResumo.statusCode).toBe(200);
    const resumo = resResumo.json();
    expect(resumo.totalEquipamentos).toBe(3);
    expect(resumo.porStatus.RECEBIDO).toBe(3);
    expect(resumo.porEstadoFisico.BOM).toBe(1);
    expect(resumo.porEstadoFisico.REGULAR).toBe(1);
    expect(resumo.porEstadoFisico.SUCATA).toBe(1);
    expect(resumo.porOrganizacao[0].quantidade).toBe(3);

    // Relatório Financeiro (AUDITOR)
    const resFin = await app.inject({
      method: 'GET',
      url: `/api/v1/relatorios/financeiro?organizacaoId=${orgId}`,
      headers: gerarCabecalhoAuth(app, Papel.AUDITOR),
    });
    expect(resFin.statusCode).toBe(200);
    const fin = resFin.json();
    expect(fin.totalEquipamentosAvaliados).toBe(3);
    expect(fin.equipamentosComValorAquisicao).toBe(2);
    expect(fin.equipamentosSemValorAquisicao).toBe(1);
    expect(fin.somaValorAquisicao).toBe('1500.00');
    expect(fin.somaValorResidual).toBe('850.00');
    expect(fin.somaImposto).toBe('85.00');

    // Consulta Auditoria com filtros (ADMIN e AUDITOR)
    const resAud = await app.inject({
      method: 'GET',
      url: `/api/v1/auditoria?entidade=Lote&acao=CRIAR&usuarioId=${ID_USUARIO_TESTE_PADRAO}&dataInicio=2020-01-01&dataFim=2030-12-31`,
      headers: gerarCabecalhoAuth(app, Papel.AUDITOR),
    });
    expect(resAud.statusCode).toBe(200);
    expect(resAud.json().dados).toHaveLength(1);
    expect(resAud.json().dados[0].entidade).toBe('Lote');

    // OPERADOR_CADASTRO e GESTOR_ALMOXARIFADO recebem 403 em /auditoria e /relatorios/*
    for (const papelNegado of [Papel.OPERADOR_CADASTRO, Papel.GESTOR_ALMOXARIFADO]) {
      const negAud = await app.inject({
        method: 'GET',
        url: '/api/v1/auditoria',
        headers: gerarCabecalhoAuth(app, papelNegado),
      });
      expect(negAud.statusCode).toBe(403);

      const negResumo = await app.inject({
        method: 'GET',
        url: '/api/v1/relatorios/resumo',
        headers: gerarCabecalhoAuth(app, papelNegado),
      });
      expect(negResumo.statusCode).toBe(403);

      const negFin = await app.inject({
        method: 'GET',
        url: '/api/v1/relatorios/financeiro',
        headers: gerarCabecalhoAuth(app, papelNegado),
      });
      expect(negFin.statusCode).toBe(403);
    }
  });

  it('matriz de permissões: GESTOR_ALMOXARIFADO e OPERADOR_CADASTRO são negados (403) em /relatorios e /auditoria', async () => {
    for (const papel of [Papel.GESTOR_ALMOXARIFADO, Papel.OPERADOR_CADASTRO]) {
      const resResumo = await app.inject({
        method: 'GET',
        url: '/api/v1/relatorios/resumo',
        headers: gerarCabecalhoAuth(app, papel),
      });
      expect(resResumo.statusCode).toBe(403);

      const resFinanceiro = await app.inject({
        method: 'GET',
        url: '/api/v1/relatorios/financeiro',
        headers: gerarCabecalhoAuth(app, papel),
      });
      expect(resFinanceiro.statusCode).toBe(403);

      const resAuditoria = await app.inject({
        method: 'GET',
        url: '/api/v1/auditoria',
        headers: gerarCabecalhoAuth(app, papel),
      });
      expect(resAuditoria.statusCode).toBe(403);
    }
  });
});
