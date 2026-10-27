import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Papel } from '../../domain/index.js';
import { exigirPapel, obterUsuarioRequisicao } from '../../plugins/auth.js';
import type { MovimentacaoService } from './movimentacao.service.js';
import {
  MovimentacaoEquipamentoParamsSchema,
  RegistrarMovimentacaoBodySchema,
  ResultadoMovimentacaoResponseSchema,
} from './movimentacao.schemas.js';

export function registrarRotasMovimentacao(
  app: FastifyInstance,
  movimentacaoService: MovimentacaoService,
): void {
  const servidor = app.withTypeProvider<TypeBoxTypeProvider>();
  const papeisEscrita = [Papel.ADMIN, Papel.GESTOR_ALMOXARIFADO] as const;

  servidor.post(
    '/equipamentos/:id/movimentacoes',
    {
      preHandler: [exigirPapel(papeisEscrita)],
      schema: {
        tags: ['Movimentações'],
        summary: 'Registra movimentação de status e/ou estado físico do equipamento em transação atômica (R3, R4, R5, R7, R10)',
        params: MovimentacaoEquipamentoParamsSchema,
        body: RegistrarMovimentacaoBodySchema,
        response: {
          200: ResultadoMovimentacaoResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const ator = obterUsuarioRequisicao(request);
      const resultado = await movimentacaoService.registrar(ator, {
        equipamentoId: request.params.id,
        versao: request.body.versao,
        statusNovo: request.body.statusNovo,
        estadoNovo: request.body.estadoNovo,
        justificativa: request.body.justificativa,
      });

      return reply.status(200).send({
        equipamento: {
          id: resultado.equipamento.id,
          loteId: resultado.equipamento.loteId,
          codigoBarrasInterno: resultado.equipamento.codigoBarrasInterno,
          tipo: resultado.equipamento.tipo,
          descricao: resultado.equipamento.descricao,
          valorAquisicao: resultado.equipamento.valorAquisicao,
          estadoFisico: resultado.equipamento.estadoFisico,
          status: resultado.equipamento.status,
          triagemCompleta: resultado.equipamento.triagemCompleta,
          classificacaoDestino: resultado.equipamento.classificacaoDestino,
          versao: resultado.equipamento.versao,
          criadoEm: resultado.equipamento.criadoEm.toISOString(),
        },
        movimentacao: {
          id: resultado.movimentacao.id,
          equipamentoId: resultado.movimentacao.equipamentoId,
          statusAnterior: resultado.movimentacao.statusAnterior,
          statusNovo: resultado.movimentacao.statusNovo,
          estadoAnterior: resultado.movimentacao.estadoAnterior,
          estadoNovo: resultado.movimentacao.estadoNovo,
          justificativa: resultado.movimentacao.justificativa,
          usuarioId: resultado.movimentacao.usuarioId,
          versao: resultado.movimentacao.versao,
          criadoEm: resultado.movimentacao.criadoEm.toISOString(),
        },
      });
    },
  );
}
