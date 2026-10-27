import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Papel } from '../../domain/index.js';
import { exigirPapel, obterUsuarioRequisicao } from '../../plugins/auth.js';
import type {
  EntidadeOrganizacao,
  EntidadeOrganizacaoDetalhe,
} from './organizacao.repository.js';
import type { OrganizacaoService } from './organizacao.service.js';
import {
  AtualizarOrganizacaoBodySchema,
  CriarOrganizacaoBodySchema,
  ListaPaginadaOrganizacoesResponseSchema,
  ListarOrganizacoesQuerySchema,
  OrganizacaoDetalheResponseSchema,
  OrganizacaoParamsSchema,
  OrganizacaoResponseSchema,
} from './organizacao.schemas.js';

function formatarDataSomenteDia(data: Date): string {
  return data.toISOString().slice(0, 10);
}

function serializarOrganizacao(org: EntidadeOrganizacao) {
  return {
    id: org.id,
    codigo: org.codigo,
    cnpj: org.cnpj,
    nome: org.nome,
    versao: org.versao,
    criadoEm: org.criadoEm.toISOString(),
  };
}

function serializarOrganizacaoDetalhe(org: EntidadeOrganizacaoDetalhe) {
  return {
    ...serializarOrganizacao(org),
    contrato: org.contrato
      ? {
          id: org.contrato.id,
          organizacaoId: org.contrato.organizacaoId,
          numero: org.contrato.numero,
          clausulas: org.contrato.clausulas,
          inicio: formatarDataSomenteDia(org.contrato.inicio),
          fim: org.contrato.fim ? formatarDataSomenteDia(org.contrato.fim) : null,
          versao: org.contrato.versao,
        }
      : null,
  };
}

export function registrarRotasOrganizacao(
  app: FastifyInstance,
  organizacaoService: OrganizacaoService,
): void {
  const servidor = app.withTypeProvider<TypeBoxTypeProvider>();

  const papeisEscrita = [Papel.ADMIN, Papel.OPERADOR_CADASTRO] as const;
  const papeisLeitura = [
    Papel.ADMIN,
    Papel.OPERADOR_CADASTRO,
    Papel.GESTOR_ALMOXARIFADO,
    Papel.AUDITOR,
  ] as const;

  servidor.post(
    '/organizacoes',
    {
      preHandler: [exigirPapel(papeisEscrita)],
      schema: {
        tags: ['Organizações'],
        summary: 'Cadastra uma nova organização parceira (R1)',
        body: CriarOrganizacaoBodySchema,
        response: {
          201: OrganizacaoResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const ator = obterUsuarioRequisicao(request);
      const criada = await organizacaoService.criar(ator, request.body);
      return reply.status(201).send(serializarOrganizacao(criada));
    },
  );

  servidor.get(
    '/organizacoes',
    {
      preHandler: [exigirPapel(papeisLeitura)],
      schema: {
        tags: ['Organizações'],
        summary: 'Lista organizações parceiras com paginação',
        querystring: ListarOrganizacoesQuerySchema,
        response: {
          200: ListaPaginadaOrganizacoesResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const ator = obterUsuarioRequisicao(request);
      const resultado = await organizacaoService.listar(ator, {
        pagina: request.query.pagina,
        tamanhoPagina: request.query.tamanhoPagina,
      });
      return reply.status(200).send({
        dados: resultado.dados.map(serializarOrganizacao),
        paginacao: resultado.paginacao,
      });
    },
  );

  servidor.get(
    '/organizacoes/:id',
    {
      preHandler: [exigirPapel(papeisLeitura)],
      schema: {
        tags: ['Organizações'],
        summary: 'Obtém detalhes de uma organização (incluindo contrato, se houver)',
        params: OrganizacaoParamsSchema,
        response: {
          200: OrganizacaoDetalheResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const ator = obterUsuarioRequisicao(request);
      const org = await organizacaoService.buscarPorId(ator, request.params.id);
      return reply.status(200).send(serializarOrganizacaoDetalhe(org));
    },
  );

  servidor.patch(
    '/organizacoes/:id',
    {
      preHandler: [exigirPapel(papeisEscrita)],
      schema: {
        tags: ['Organizações'],
        summary: 'Atualiza dados de uma organização com versionamento otimista',
        params: OrganizacaoParamsSchema,
        body: AtualizarOrganizacaoBodySchema,
        response: {
          200: OrganizacaoResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const ator = obterUsuarioRequisicao(request);
      const atualizada = await organizacaoService.atualizar(ator, {
        id: request.params.id,
        versao: request.body.versao,
        codigo: request.body.codigo,
        nome: request.body.nome,
      });
      return reply.status(200).send(serializarOrganizacao(atualizada));
    },
  );
}
