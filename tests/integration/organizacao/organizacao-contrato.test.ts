import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/app.js';
import { Papel } from '../../../src/domain/index.js';
import { prisma } from '../../../src/lib/prisma.js';
import {
  ID_USUARIO_TESTE_PADRAO,
  garantirUsuarioTesteNoBanco,
  gerarCabecalhoAuth,
  limparBanco,
} from '../../helpers/banco.js';

describe('Integração: /api/v1/organizacoes e /api/v1/organizacoes/:id/contrato', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(async () => {
    await limparBanco();
    await garantirUsuarioTesteNoBanco(ID_USUARIO_TESTE_PADRAO, Papel.ADMIN);
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/v1/organizacoes cria organização com CNPJ normalizado e registra auditoria no banco', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/organizacoes',
      headers: gerarCabecalhoAuth(app, Papel.OPERADOR_CADASTRO),
      payload: {
        codigo: 'br001',
        cnpj: '11.222.333/0001-81',
        nome: 'Cooperativa EcoTech',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.codigo).toBe('BR001');
    expect(body.cnpj).toBe('11222333000181');
    expect(body.versao).toBe(1);

    const auditorias = await prisma.auditoria.findMany({
      where: { entidade: 'Organizacao', entidadeId: body.id },
    });
    expect(auditorias).toHaveLength(1);
    expect(auditorias[0]?.acao).toBe('CRIAR');
  });

  it('rejeita CNPJ inválido (422), dígitos repetidos (422) e CNPJ duplicado (409)', async () => {
    const resInvalido = await app.inject({
      method: 'POST',
      url: '/api/v1/organizacoes',
      headers: gerarCabecalhoAuth(app, Papel.ADMIN),
      payload: {
        codigo: 'BR001',
        cnpj: '11.222.333/0001-82',
        nome: 'Org Inválida',
      },
    });
    expect(resInvalido.statusCode).toBe(422);
    expect(resInvalido.json().erro).toBe('CNPJ_INVALIDO');

    const resRepetido = await app.inject({
      method: 'POST',
      url: '/api/v1/organizacoes',
      headers: gerarCabecalhoAuth(app, Papel.ADMIN),
      payload: {
        codigo: 'BR002',
        cnpj: '11.111.111/1111-11',
        nome: 'Org Repetida',
      },
    });
    expect(resRepetido.statusCode).toBe(422);

    await app.inject({
      method: 'POST',
      url: '/api/v1/organizacoes',
      headers: gerarCabecalhoAuth(app, Papel.ADMIN),
      payload: {
        codigo: 'BR003',
        cnpj: '11.222.333/0001-81',
        nome: 'Org Original',
      },
    });

    const resDuplicado = await app.inject({
      method: 'POST',
      url: '/api/v1/organizacoes',
      headers: gerarCabecalhoAuth(app, Papel.ADMIN),
      payload: {
        codigo: 'BR004',
        cnpj: '11222333000181',
        nome: 'Org Duplicada',
      },
    });
    expect(resDuplicado.statusCode).toBe(409);
    expect(resDuplicado.json().erro).toBe('CONFLITO');
  });

  it('lista organizações paginadas e aplica versionamento otimista no PATCH (200 e 409)', async () => {
    const criacao = await app.inject({
      method: 'POST',
      url: '/api/v1/organizacoes',
      headers: gerarCabecalhoAuth(app, Papel.ADMIN),
      payload: {
        codigo: 'BR010',
        cnpj: '12.ABC.345/01DE-35',
        nome: 'Org Alfanumérica',
      },
    });
    const org = criacao.json();

    const lista = await app.inject({
      method: 'GET',
      url: '/api/v1/organizacoes?pagina=1&tamanhoPagina=10',
      headers: gerarCabecalhoAuth(app, Papel.AUDITOR),
    });
    expect(lista.statusCode).toBe(200);
    expect(lista.json().dados).toHaveLength(1);
    expect(lista.json().paginacao.total).toBe(1);

    const patchOk = await app.inject({
      method: 'PATCH',
      url: `/api/v1/organizacoes/${org.id}`,
      headers: gerarCabecalhoAuth(app, Papel.OPERADOR_CADASTRO),
      payload: {
        versao: 1,
        nome: 'Org Alfanumérica Atualizada',
      },
    });
    expect(patchOk.statusCode).toBe(200);
    expect(patchOk.json().versao).toBe(2);

    const patchConflito = await app.inject({
      method: 'PATCH',
      url: `/api/v1/organizacoes/${org.id}`,
      headers: gerarCabecalhoAuth(app, Papel.OPERADOR_CADASTRO),
      payload: {
        versao: 1,
        nome: 'Tentativa Com Versão Antiga',
      },
    });
    expect(patchConflito.statusCode).toBe(409);
    expect(patchConflito.json().erro).toBe('CONFLITO_DE_VERSAO');
  });

  it('cria, consulta e atualiza contrato de uma organização e valida fim >= inicio', async () => {
    const criacaoOrg = await app.inject({
      method: 'POST',
      url: '/api/v1/organizacoes',
      headers: gerarCabecalhoAuth(app, Papel.ADMIN),
      payload: {
        codigo: 'BR020',
        cnpj: '11222333000181',
        nome: 'Org Com Contrato',
      },
    });
    const orgId = criacaoOrg.json().id as string;

    const contratoInvalido = await app.inject({
      method: 'POST',
      url: `/api/v1/organizacoes/${orgId}/contrato`,
      headers: gerarCabecalhoAuth(app, Papel.ADMIN),
      payload: {
        numero: 'CT-ERR',
        inicio: '2026-05-10',
        fim: '2026-05-01',
      },
    });
    expect(contratoInvalido.statusCode).toBe(422);

    const contratoCriado = await app.inject({
      method: 'POST',
      url: `/api/v1/organizacoes/${orgId}/contrato`,
      headers: gerarCabecalhoAuth(app, Papel.OPERADOR_CADASTRO),
      payload: {
        numero: 'CT-2026-100',
        clausulas: { coletaMensalKg: 500 },
        inicio: '2026-01-01',
        fim: '2026-12-31',
      },
    });
    expect(contratoCriado.statusCode).toBe(201);
    expect(contratoCriado.json().versao).toBe(1);

    const getContrato = await app.inject({
      method: 'GET',
      url: `/api/v1/organizacoes/${orgId}/contrato`,
      headers: gerarCabecalhoAuth(app, Papel.GESTOR_ALMOXARIFADO),
    });
    expect(getContrato.statusCode).toBe(200);
    expect(getContrato.json().numero).toBe('CT-2026-100');

    const getOrgDetalhe = await app.inject({
      method: 'GET',
      url: `/api/v1/organizacoes/${orgId}`,
      headers: gerarCabecalhoAuth(app, Papel.AUDITOR),
    });
    expect(getOrgDetalhe.statusCode).toBe(200);
    expect(getOrgDetalhe.json().contrato.numero).toBe('CT-2026-100');

    const patchContrato = await app.inject({
      method: 'PATCH',
      url: `/api/v1/organizacoes/${orgId}/contrato`,
      headers: gerarCabecalhoAuth(app, Papel.ADMIN),
      payload: {
        versao: 1,
        fim: '2027-12-31',
      },
    });
    expect(patchContrato.statusCode).toBe(200);
    expect(patchContrato.json().versao).toBe(2);
    expect(patchContrato.json().fim).toBe('2027-12-31');
  });

  it('bloqueia acesso sem autenticação (401) e tentativa de escrita por AUDITOR ou GESTOR (403)', async () => {
    const semAuth = await app.inject({
      method: 'GET',
      url: '/api/v1/organizacoes',
    });
    expect(semAuth.statusCode).toBe(401);

    const auditorEscritaOrg = await app.inject({
      method: 'POST',
      url: '/api/v1/organizacoes',
      headers: gerarCabecalhoAuth(app, Papel.AUDITOR),
      payload: {
        codigo: 'BR999',
        cnpj: '11222333000181',
        nome: 'Proibido',
      },
    });
    expect(auditorEscritaOrg.statusCode).toBe(403);

    const gestorEscritaOrg = await app.inject({
      method: 'POST',
      url: '/api/v1/organizacoes',
      headers: gerarCabecalhoAuth(app, Papel.GESTOR_ALMOXARIFADO),
      payload: {
        codigo: 'BR998',
        cnpj: '11222333000181',
        nome: 'Proibido Gestor',
      },
    });
    expect(gestorEscritaOrg.statusCode).toBe(403);
  });
});
