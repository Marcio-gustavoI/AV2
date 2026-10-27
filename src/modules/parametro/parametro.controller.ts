import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Papel } from '../../domain/index.js';
import { exigirPapel, obterUsuarioRequisicao } from '../../plugins/auth.js';
import type { EntidadeParametro } from './parametro.repository.js';
import type { ParametroService } from './parametro.service.js';
import {
  DefinirParametroPorChaveBodySchema,
  DefinirParametrosLoteBodySchema,
  ListaParametrosResponseSchema,
  ParametroChaveParamsSchema,
  ParametroResponseSchema,
} from './parametro.schemas.js';

function serializarParametro(p: EntidadeParametro) {
  return {
    chave: p.chave,
    valor: p.valor,
    versao: p.versao,
    atualizadoEm: p.atualizadoEm.toISOString(),
  };
}

export function registrarRotasParametro(
  app: FastifyInstance,
  parametroService: ParametroService,
): void {
  const servidor = app.withTypeProvider<TypeBoxTypeProvider>();
  const somenteAdmin = [Papel.ADMIN] as const;

  servidor.get(
    '/parametros',
    {
      preHandler: [exigirPapel(somenteAdmin)],
      schema: {
        tags: ['Parâmetros'],
        summary: 'Lista todos os parâmetros globais do sistema (exclusivo ADMIN)',
        response: {
          200: ListaParametrosResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const ator = obterUsuarioRequisicao(request);
      const lista = await parametroService.listar(ator);
      return reply.status(200).send({
        dados: lista.map(serializarParametro),
      });
    },
  );

  servidor.put(
    '/parametros',
    {
      preHandler: [exigirPapel(somenteAdmin)],
      schema: {
        tags: ['Parâmetros'],
        summary: 'Define ou atualiza múltiplos parâmetros globais (exclusivo ADMIN)',
        body: DefinirParametrosLoteBodySchema,
        response: {
          200: ListaParametrosResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const ator = obterUsuarioRequisicao(request);
      const atualizados = await parametroService.definirLote(ator, request.body.parametros);
      return reply.status(200).send({
        dados: atualizados.map(serializarParametro),
      });
    },
  );

  servidor.put(
    '/parametros/:chave',
    {
      preHandler: [exigirPapel(somenteAdmin)],
      schema: {
        tags: ['Parâmetros'],
        summary: 'Define ou atualiza um parâmetro global específico (exclusivo ADMIN)',
        params: ParametroChaveParamsSchema,
        body: DefinirParametroPorChaveBodySchema,
        response: {
          200: ParametroResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const ator = obterUsuarioRequisicao(request);
      const atualizado = await parametroService.definir(ator, {
        chave: request.params.chave,
        valor: request.body.valor,
        versao: request.body.versao,
      });
      return reply.status(200).send(serializarParametro(atualizado));
    },
  );
}
