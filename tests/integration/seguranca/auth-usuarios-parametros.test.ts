import { Writable } from 'node:stream';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pino from 'pino';
import { executarProvisionamentoAdmin } from '../../../scripts/criar-admin.js';
import { buildApp } from '../../../src/app.js';
import {
  ClassificacaoDestino,
  EstadoFisico,
  Papel,
  StatusEquipamento,
  TipoEquipamento,
} from '../../../src/domain/index.js';
import { CAMINHOS_REDACAO_LOG } from '../../../src/lib/logger.js';
import {
  ID_USUARIO_TESTE_PADRAO,
  garantirUsuarioTesteNoBanco,
  gerarCabecalhoAuth,
  limparBanco,
} from '../../helpers/banco.js';

describe('Integração Fase 5: Segurança (Auth, JWT, Usuários, Parâmetros, Matriz RBAC, Rate Limit, Logs)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(async () => {
    await limparBanco();
    await garantirUsuarioTesteNoBanco(
      ID_USUARIO_TESTE_PADRAO,
      Papel.ADMIN,
      'admin-padrao@greencode.local',
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('provisiona admin via criar-admin, realiza login, renova token e retorna perfil em /auth/me', async () => {
    const prov = await executarProvisionamentoAdmin({
      email: 'admin@greencode.com.br',
      senha: 'AdminForte2026',
    });
    expect(prov.criadoAgora).toBe(true);

    const provRepetido = await executarProvisionamentoAdmin({
      email: 'admin@greencode.com.br',
      senha: 'AdminForte2026',
    });
    expect(provRepetido.criadoAgora).toBe(false);

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      remoteAddress: '10.0.0.1',
      payload: {
        email: 'ADMIN@greencode.com.br',
        senha: 'AdminForte2026',
      },
    });
    expect(loginRes.statusCode).toBe(200);
    const loginBody = loginRes.json();
    expect(typeof loginBody.token).toBe('string');
    expect(loginBody.usuario.papel).toBe(Papel.ADMIN);
    expect('senhaHash' in loginBody.usuario).toBe(false);

    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        authorization: `Bearer ${loginBody.token}`,
      },
    });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().papel).toBe(Papel.ADMIN);
    expect(meRes.json().permissoes).toContain('usuarios:escrita');

    const renovarRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/renovar',
      headers: {
        authorization: `Bearer ${loginBody.token}`,
      },
    });
    expect(renovarRes.statusCode).toBe(200);
    expect(typeof renovarRes.json().token).toBe('string');
  });

  it('login com senha errada e com e-mail inexistente devolvem respostas idênticas (401)', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/usuarios',
      headers: gerarCabecalhoAuth(app, Papel.ADMIN),
      payload: {
        email: 'operador@greencode.com.br',
        senha: 'SenhaCorreta123',
        papel: Papel.OPERADOR_CADASTRO,
      },
    });

    const resSenhaErrada = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      remoteAddress: '10.0.0.2',
      payload: {
        email: 'operador@greencode.com.br',
        senha: 'SenhaErrada999',
      },
    });

    const resEmailInexistente = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      remoteAddress: '10.0.0.3',
      payload: {
        email: 'fantasma@greencode.com.br',
        senha: 'SenhaErrada999',
      },
    });

    expect(resSenhaErrada.statusCode).toBe(401);
    expect(resEmailInexistente.statusCode).toBe(401);
    expect(resSenhaErrada.json()).toEqual(resEmailInexistente.json());
  });

  it('token ausente (401): rejeita requisição sem cabeçalho Authorization', async () => {
    const semToken = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
    });
    expect(semToken.statusCode).toBe(401);
  });

  it('token expirado (401): rejeita JWT com expiração vencida', async () => {
    const tokenExpirado = app.jwt.sign(
      { sub: ID_USUARIO_TESTE_PADRAO, papel: Papel.ADMIN },
      { expiresIn: -10 },
    );
    const resExpirado = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${tokenExpirado}` },
    });
    expect(resExpirado.statusCode).toBe(401);
  });

  it('token adulterado (401): rejeita JWT com assinatura adulterada', async () => {
    const tokenValido = app.jwt.sign({ sub: ID_USUARIO_TESTE_PADRAO, papel: Papel.ADMIN });
    const partes = tokenValido.split('.');
    const tokenAdulterado = `${partes[0]}.${partes[1]}.assinaturaAdulteradaInvalida`;
    const resAdulterado = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${tokenAdulterado}` },
    });
    expect(resAdulterado.statusCode).toBe(401);
  });

  it('usuário inativo (401): impede login e renovação de usuário desativado (R12)', async () => {
    const criacaoInativo = await app.inject({
      method: 'POST',
      url: '/api/v1/usuarios',
      headers: gerarCabecalhoAuth(app, Papel.ADMIN),
      payload: {
        email: 'inativo@greencode.com.br',
        senha: 'SenhaInativo123',
        papel: Papel.AUDITOR,
        ativo: false,
      },
    });
    expect(criacaoInativo.statusCode).toBe(201);
    const inativoId = criacaoInativo.json().id as string;

    const loginInativo = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      remoteAddress: '10.0.0.4',
      payload: {
        email: 'inativo@greencode.com.br',
        senha: 'SenhaInativo123',
      },
    });
    expect(loginInativo.statusCode).toBe(401);

    const tokenInativo = app.jwt.sign({ sub: inativoId, papel: Papel.AUDITOR });
    const renovarInativo = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/renovar',
      headers: { authorization: `Bearer ${tokenInativo}` },
    });
    expect(renovarInativo.statusCode).toBe(401);
  });

  it('aplica rate limit no POST /api/v1/auth/login retornando 429 na 6ª tentativa do mesmo IP', async () => {
    const ipTeste = '192.168.99.50';
    for (let i = 1; i <= 5; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        remoteAddress: ipTeste,
        payload: {
          email: 'tentativa@greencode.com.br',
          senha: 'SenhaErrada123',
        },
      });
      expect(res.statusCode).toBe(401);
    }

    const sextaTentativa = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      remoteAddress: ipTeste,
      payload: {
        email: 'tentativa@greencode.com.br',
        senha: 'SenhaErrada123',
      },
    });
    expect(sextaTentativa.statusCode).toBe(429);
    expect(sextaTentativa.json().erro).toBe('LIMITE_REQUISICOES');
  });

  it('senhaHash ausente em todas as respostas de usuário (POST, GET por ID, GET lista, PATCH) e impede auto-desativação de ADMIN', async () => {
    const criacao = await app.inject({
      method: 'POST',
      url: '/api/v1/usuarios',
      headers: gerarCabecalhoAuth(app, Papel.ADMIN),
      payload: {
        email: 'gestor1@greencode.com.br',
        senha: 'SenhaGestor123',
        papel: Papel.GESTOR_ALMOXARIFADO,
      },
    });
    expect(criacao.statusCode).toBe(201);
    expect(criacao.body).not.toContain('senhaHash');
    expect(criacao.body).not.toContain('$2');

    const userId = criacao.json().id as string;

    const getId = await app.inject({
      method: 'GET',
      url: `/api/v1/usuarios/${userId}`,
      headers: gerarCabecalhoAuth(app, Papel.ADMIN),
    });
    expect(getId.statusCode).toBe(200);
    expect(getId.body).not.toContain('senhaHash');

    const getLista = await app.inject({
      method: 'GET',
      url: '/api/v1/usuarios',
      headers: gerarCabecalhoAuth(app, Papel.ADMIN),
    });
    expect(getLista.statusCode).toBe(200);
    expect(getLista.body).not.toContain('senhaHash');

    const patchUser = await app.inject({
      method: 'PATCH',
      url: `/api/v1/usuarios/${userId}`,
      headers: gerarCabecalhoAuth(app, Papel.ADMIN),
      payload: {
        versao: 1,
        papel: Papel.AUDITOR,
      },
    });
    expect(patchUser.statusCode).toBe(200);
    expect(patchUser.body).not.toContain('senhaHash');
    expect(patchUser.json().versao).toBe(2);

    const autoDesativacao = await app.inject({
      method: 'PATCH',
      url: `/api/v1/usuarios/${ID_USUARIO_TESTE_PADRAO}`,
      headers: gerarCabecalhoAuth(app, Papel.ADMIN, ID_USUARIO_TESTE_PADRAO),
      payload: {
        versao: 1,
        ativo: false,
      },
    });
    expect(autoDesativacao.statusCode).toBe(422);
    expect(autoDesativacao.json().erro).toBe('AUTO_DESATIVACAO_PROIBIDA');
  });

  it('auditor tentando escrever em CADA recurso (403) e validação de cada célula negada da matriz de permissões', async () => {
    // Prepara recursos base com ADMIN/OPERADOR/GESTOR para testar escrita do AUDITOR em todos os endpoints
    const orgCriada = await app.inject({
      method: 'POST',
      url: '/api/v1/organizacoes',
      headers: gerarCabecalhoAuth(app, Papel.OPERADOR_CADASTRO),
      payload: {
        codigo: 'ORG-MATRIZ',
        cnpj: '11.222.333/0001-81',
        nome: 'Org Matriz RBAC',
      },
    });
    expect(orgCriada.statusCode).toBe(201);
    const orgId = orgCriada.json().id as string;

    const hoje = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const loteCriado = await app.inject({
      method: 'POST',
      url: '/api/v1/lotes',
      headers: gerarCabecalhoAuth(app, Papel.GESTOR_ALMOXARIFADO),
      payload: {
        organizacaoId: orgId,
        notaFiscal: 'NF-MATRIZ-1',
        transportadora: 'Transp Matriz',
        dataEntrada: hoje,
        equipamentos: [
          {
            tipo: TipoEquipamento.NOTEBOOK,
            descricao: 'Notebook Matriz',
            estadoFisico: EstadoFisico.BOM,
          },
        ],
      },
    });
    expect(loteCriado.statusCode).toBe(201);
    const loteId = loteCriado.json().id as string;
    const eqId = loteCriado.json().equipamentos[0].id as string;

    // 1. Usuários e Parâmetros: OPERADOR, GESTOR e AUDITOR negados em leitura e escrita (403)
    for (const papelNaoAdmin of [
      Papel.OPERADOR_CADASTRO,
      Papel.GESTOR_ALMOXARIFADO,
      Papel.AUDITOR,
    ]) {
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/api/v1/usuarios',
            headers: gerarCabecalhoAuth(app, papelNaoAdmin),
          })
        ).statusCode,
      ).toBe(403);

      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/usuarios',
            headers: gerarCabecalhoAuth(app, papelNaoAdmin),
            payload: {
              email: `negado-${papelNaoAdmin}@greencode.com`,
              senha: 'SenhaValida123',
              papel: Papel.AUDITOR,
            },
          })
        ).statusCode,
      ).toBe(403);

      expect(
        (
          await app.inject({
            method: 'PATCH',
            url: `/api/v1/usuarios/${ID_USUARIO_TESTE_PADRAO}`,
            headers: gerarCabecalhoAuth(app, papelNaoAdmin),
            payload: { versao: 1, ativo: false },
          })
        ).statusCode,
      ).toBe(403);

      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/api/v1/parametros',
            headers: gerarCabecalhoAuth(app, papelNaoAdmin),
          })
        ).statusCode,
      ).toBe(403);

      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/api/v1/parametros',
            headers: gerarCabecalhoAuth(app, papelNaoAdmin),
            payload: { parametros: [{ chave: 'ALIQUOTA_IMPOSTO', valor: 0.15 }] },
          })
        ).statusCode,
      ).toBe(403);

      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/api/v1/parametros/ALIQUOTA_IMPOSTO',
            headers: gerarCabecalhoAuth(app, papelNaoAdmin),
            payload: { valor: 0.15 },
          })
        ).statusCode,
      ).toBe(403);
    }

    // 2. ADMIN pode ler e atualizar parâmetros
    const putAdminParam = await app.inject({
      method: 'PUT',
      url: '/api/v1/parametros/ALIQUOTA_IMPOSTO',
      headers: gerarCabecalhoAuth(app, Papel.ADMIN),
      payload: { valor: '0.12' },
    });
    expect(putAdminParam.statusCode).toBe(200);
    expect(putAdminParam.json().valor).toBe('0.120000');

    const getAdminParam = await app.inject({
      method: 'GET',
      url: '/api/v1/parametros',
      headers: gerarCabecalhoAuth(app, Papel.ADMIN),
    });
    expect(getAdminParam.statusCode).toBe(200);

    // 3. Organizações e Contratos: GESTOR e AUDITOR negados na escrita (403)
    for (const papelSomenteLeituraOrg of [Papel.GESTOR_ALMOXARIFADO, Papel.AUDITOR]) {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/organizacoes',
            headers: gerarCabecalhoAuth(app, papelSomenteLeituraOrg),
            payload: { codigo: 'ORG-NEG', cnpj: '12.ABC.345/01DE-35', nome: 'Negada' },
          })
        ).statusCode,
      ).toBe(403);

      expect(
        (
          await app.inject({
            method: 'PATCH',
            url: `/api/v1/organizacoes/${orgId}`,
            headers: gerarCabecalhoAuth(app, papelSomenteLeituraOrg),
            payload: { versao: 1, nome: 'Negada' },
          })
        ).statusCode,
      ).toBe(403);

      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/v1/organizacoes/${orgId}/contrato`,
            headers: gerarCabecalhoAuth(app, papelSomenteLeituraOrg),
            payload: { numero: 'CT-NEG', inicio: '2026-01-01' },
          })
        ).statusCode,
      ).toBe(403);

      expect(
        (
          await app.inject({
            method: 'PATCH',
            url: `/api/v1/organizacoes/${orgId}/contrato`,
            headers: gerarCabecalhoAuth(app, papelSomenteLeituraOrg),
            payload: { versao: 1, numero: 'CT-NEG-2' },
          })
        ).statusCode,
      ).toBe(403);
    }

    // 4. AUDITOR tentando escrever em Lote, Equipamento, Triagem e Movimentação -> 403 em todos
    const headersAuditor = gerarCabecalhoAuth(app, Papel.AUDITOR);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/lotes',
          headers: headersAuditor,
          payload: {
            organizacaoId: orgId,
            notaFiscal: 'NF-AUD-NEG',
            transportadora: 'T',
            dataEntrada: hoje,
          },
        })
      ).statusCode,
    ).toBe(403);

    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/equipamentos',
          headers: headersAuditor,
          payload: {
            loteId,
            tipo: TipoEquipamento.DESKTOP,
            descricao: 'PC Negado Auditor',
            estadoFisico: EstadoFisico.BOM,
          },
        })
      ).statusCode,
    ).toBe(403);

    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/equipamentos/${eqId}/triagem`,
          headers: headersAuditor,
          payload: {
            versao: 1,
            classificacaoDestino: ClassificacaoDestino.RECICLAGEM,
            estadoFisico: EstadoFisico.BOM,
          },
        })
      ).statusCode,
    ).toBe(403);

    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/equipamentos/${eqId}/movimentacoes`,
          headers: headersAuditor,
          payload: {
            versao: 1,
            statusNovo: StatusEquipamento.EM_TRIAGEM,
          },
        })
      ).statusCode,
    ).toBe(403);
  });

  it('segredo e senha ausentes nos logs: redige senha, senhaHash, token e authorization nos logs do Pino', () => {
    const linhas: string[] = [];
    const destinoMemoria = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        linhas.push(chunk.toString('utf8'));
        callback();
      },
    });

    const loggerTeste = pino(
      {
        redact: {
          paths: [...CAMINHOS_REDACAO_LOG],
          censor: '[REDACTED]',
        },
      },
      destinoMemoria,
    );

    loggerTeste.info(
      {
        req: { headers: { authorization: 'Bearer segredo-jwt-super-confidencial' } },
        body: { senha: 'MinhaSenhaSecreta123' },
        usuario: { senhaHash: '$2b$12$hashSecretoNaoDeveAparecer' },
        token: 'jwt-direto-secreto',
      },
      'teste de redação',
    );

    const saidaCompleta = linhas.join('');
    expect(saidaCompleta).not.toContain('segredo-jwt-super-confidencial');
    expect(saidaCompleta).not.toContain('MinhaSenhaSecreta123');
    expect(saidaCompleta).not.toContain('$2b$12$hashSecretoNaoDeveAparecer');
    expect(saidaCompleta).not.toContain('jwt-direto-secreto');
    expect(saidaCompleta).toContain('[REDACTED]');
  });
});
