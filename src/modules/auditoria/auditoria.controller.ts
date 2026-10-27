import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Papel } from '../../domain/index.js';
import { exigirPapel, obterUsuarioRequisicao } from '../../plugins/auth.js';
import type { AuditoriaService } from './auditoria.service.js';
import {
  ListaPaginadaAuditoriaResponseSchema,
  ListarAuditoriaQuerySchema,
} from './auditoria.schemas.js';

export function registrarRotasAuditoria(
  app: FastifyInstance,
  auditoriaService: AuditoriaService,
): void {
  const servidor = app.withTypeProvider<TypeBoxTypeProvider>();
  const papeisPermitidos = [Papel.ADMIN, Papel.AUDITOR] as const;

  servidor.get(
    '/auditoria',
    {
      preHandler: [exigirPapel(papeisPermitidos)],
      schema: {
        tags: ['Auditoria'],
        summary: 'Consulta o journal imutável de auditoria com filtros e paginação (ADMIN e AUDITOR)',
        querystring: ListarAuditoriaQuerySchema,
        response: {
          200: ListaPaginadaAuditoriaResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const ator = obterUsuarioRequisicao(request);
      const resultado = await auditoriaService.listar(ator, {
        pagina: request.query.pagina,
        tamanhoPagina: request.query.tamanhoPagina,
        usuarioId: request.query.usuarioId,
        entidade: request.query.entidade,
        acao: request.query.acao,
        dataInicio: request.query.dataInicio,
        dataFim: request.query.dataFim,
      });

      return reply.status(200).send({
        dados: resultado.dados.map((r) => ({
          id: r.id,
          usuarioId: r.usuarioId,
          acao: r.acao,
          entidade: r.entidade,
          entidadeId: r.entidadeId,
          antes: r.antes,
          depois: r.depois,
          criadoEm: r.criadoEm.toISOString(),
        })),
        paginacao: resultado.paginacao,
      });
    },
  );
}
