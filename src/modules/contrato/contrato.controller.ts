import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Papel } from '../../domain/index.js';
import { exigirPapel, obterUsuarioRequisicao } from '../../plugins/auth.js';
import type { EntidadeContrato } from './contrato.repository.js';
import type { ContratoService } from './contrato.service.js';
import {
  AtualizarContratoBodySchema,
  ContratoOrgParamsSchema,
  ContratoResponseSchema,
  CriarContratoBodySchema,
} from './contrato.schemas.js';

function formatarDataSomenteDia(data: Date): string {
  return data.toISOString().slice(0, 10);
}

function serializarContrato(contrato: EntidadeContrato) {
  return {
    id: contrato.id,
    organizacaoId: contrato.organizacaoId,
    numero: contrato.numero,
    clausulas: contrato.clausulas,
    inicio: formatarDataSomenteDia(contrato.inicio),
    fim: contrato.fim ? formatarDataSomenteDia(contrato.fim) : null,
    versao: contrato.versao,
  };
}

export function registrarRotasContrato(
  app: FastifyInstance,
  contratoService: ContratoService,
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
    '/organizacoes/:id/contrato',
    {
      preHandler: [exigirPapel(papeisEscrita)],
      schema: {
        tags: ['Contratos'],
        summary: 'Cadastra o contrato de uma organização parceira',
        params: ContratoOrgParamsSchema,
        body: CriarContratoBodySchema,
        response: {
          201: ContratoResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const ator = obterUsuarioRequisicao(request);
      const criado = await contratoService.criar(ator, {
        organizacaoId: request.params.id,
        numero: request.body.numero,
        clausulas: request.body.clausulas,
        inicio: request.body.inicio,
        fim: request.body.fim,
      });
      return reply.status(201).send(serializarContrato(criado));
    },
  );

  servidor.get(
    '/organizacoes/:id/contrato',
    {
      preHandler: [exigirPapel(papeisLeitura)],
      schema: {
        tags: ['Contratos'],
        summary: 'Obtém o contrato vinculado a uma organização',
        params: ContratoOrgParamsSchema,
        response: {
          200: ContratoResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const ator = obterUsuarioRequisicao(request);
      const contrato = await contratoService.buscarPorOrganizacao(ator, request.params.id);
      return reply.status(200).send(serializarContrato(contrato));
    },
  );

  servidor.patch(
    '/organizacoes/:id/contrato',
    {
      preHandler: [exigirPapel(papeisEscrita)],
      schema: {
        tags: ['Contratos'],
        summary: 'Atualiza o contrato de uma organização com versionamento otimista',
        params: ContratoOrgParamsSchema,
        body: AtualizarContratoBodySchema,
        response: {
          200: ContratoResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const ator = obterUsuarioRequisicao(request);
      const atualizado = await contratoService.atualizar(ator, {
        organizacaoId: request.params.id,
        versao: request.body.versao,
        numero: request.body.numero,
        clausulas: request.body.clausulas,
        inicio: request.body.inicio,
        fim: request.body.fim,
      });
      return reply.status(200).send(serializarContrato(atualizado));
    },
  );
}
