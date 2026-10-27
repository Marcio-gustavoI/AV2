import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Papel } from '../../domain/index.js';
import { exigirPapel, obterUsuarioRequisicao } from '../../plugins/auth.js';
import type { RelatorioService } from './relatorio.service.js';
import {
  FiltroRelatorioQuerySchema,
  RelatorioFinanceiroResponseSchema,
  RelatorioResumoResponseSchema,
} from './relatorio.schemas.js';

export function registrarRotasRelatorio(
  app: FastifyInstance,
  relatorioService: RelatorioService,
): void {
  const servidor = app.withTypeProvider<TypeBoxTypeProvider>();
  const papeisPermitidos = [Papel.ADMIN, Papel.AUDITOR] as const;

  servidor.get(
    '/relatorios/resumo',
    {
      preHandler: [exigirPapel(papeisPermitidos)],
      schema: {
        tags: ['Relatórios'],
        summary: 'Gera relatório resumido por status, estado físico, organização e período (ADMIN e AUDITOR)',
        querystring: FiltroRelatorioQuerySchema,
        response: {
          200: RelatorioResumoResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const ator = obterUsuarioRequisicao(request);
      const resumo = await relatorioService.gerarResumo(ator, {
        organizacaoId: request.query.organizacaoId,
        dataInicio: request.query.dataInicio,
        dataFim: request.query.dataFim,
      });
      return reply.status(200).send(resumo);
    },
  );

  servidor.get(
    '/relatorios/financeiro',
    {
      preHandler: [exigirPapel(papeisPermitidos)],
      schema: {
        tags: ['Relatórios'],
        summary: 'Calcula depreciação, valor residual e imposto com aritmética Decimal (R8, ADMIN e AUDITOR)',
        querystring: FiltroRelatorioQuerySchema,
        response: {
          200: RelatorioFinanceiroResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const ator = obterUsuarioRequisicao(request);
      const financeiro = await relatorioService.gerarFinanceiro(ator, {
        organizacaoId: request.query.organizacaoId,
        dataInicio: request.query.dataInicio,
        dataFim: request.query.dataFim,
      });
      return reply.status(200).send(financeiro);
    },
  );
}
