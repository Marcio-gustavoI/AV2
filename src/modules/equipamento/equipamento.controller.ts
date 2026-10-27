import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Papel } from '../../domain/index.js';
import { exigirPapel, obterUsuarioRequisicao } from '../../plugins/auth.js';
import type {
  EntidadeEquipamento,
  EntidadeEquipamentoDetalhe,
} from './equipamento.repository.js';
import type { EquipamentoService } from './equipamento.service.js';
import {
  CriarEquipamentoBodySchema,
  EquipamentoDetalheResponseSchema,
  EquipamentoParamsSchema,
  EquipamentoResponseSchema,
  ListaPaginadaEquipamentosResponseSchema,
  ListarEquipamentosQuerySchema,
  RastreabilidadeEquipamentoResponseSchema,
  RealizarTriagemBodySchema,
} from './equipamento.schemas.js';

function serializarEquipamento(eq: EntidadeEquipamento) {
  return {
    id: eq.id,
    loteId: eq.loteId,
    codigoBarrasInterno: eq.codigoBarrasInterno,
    tipo: eq.tipo,
    descricao: eq.descricao,
    valorAquisicao: eq.valorAquisicao,
    estadoFisico: eq.estadoFisico,
    status: eq.status,
    triagemCompleta: eq.triagemCompleta,
    classificacaoDestino: eq.classificacaoDestino,
    versao: eq.versao,
    criadoEm: eq.criadoEm.toISOString(),
  };
}

function serializarEquipamentoDetalhe(eq: EntidadeEquipamentoDetalhe) {
  return {
    ...serializarEquipamento(eq),
    lote: {
      id: eq.lote.id,
      organizacaoId: eq.lote.organizacaoId,
      notaFiscal: eq.lote.notaFiscal,
      transportadora: eq.lote.transportadora,
      dataEntrada: eq.lote.dataEntrada.toISOString().slice(0, 10),
      organizacao: eq.lote.organizacao,
    },
  };
}

export function registrarRotasEquipamento(
  app: FastifyInstance,
  equipamentoService: EquipamentoService,
): void {
  const servidor = app.withTypeProvider<TypeBoxTypeProvider>();

  const papeisEscrita = [Papel.ADMIN, Papel.GESTOR_ALMOXARIFADO] as const;
  const papeisLeitura = [
    Papel.ADMIN,
    Papel.OPERADOR_CADASTRO,
    Papel.GESTOR_ALMOXARIFADO,
    Papel.AUDITOR,
  ] as const;

  servidor.post(
    '/equipamentos',
    {
      preHandler: [exigirPapel(papeisEscrita)],
      schema: {
        tags: ['Equipamentos'],
        summary: 'Cadastra um equipamento vinculado a um lote existente (R6, R11)',
        body: CriarEquipamentoBodySchema,
        response: {
          201: EquipamentoResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const ator = obterUsuarioRequisicao(request);
      const criado = await equipamentoService.criar(ator, {
        loteId: request.body.loteId,
        tipo: request.body.tipo,
        descricao: request.body.descricao,
        estadoFisico: request.body.estadoFisico,
        valorAquisicao: request.body.valorAquisicao,
        codigoBarrasInterno: request.body.codigoBarrasInterno,
      });
      return reply.status(201).send(serializarEquipamento(criado));
    },
  );

  servidor.get(
    '/equipamentos',
    {
      preHandler: [exigirPapel(papeisLeitura)],
      schema: {
        tags: ['Equipamentos'],
        summary: 'Lista equipamentos com filtros e paginação',
        querystring: ListarEquipamentosQuerySchema,
        response: {
          200: ListaPaginadaEquipamentosResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const ator = obterUsuarioRequisicao(request);
      const resultado = await equipamentoService.listar(ator, {
        pagina: request.query.pagina,
        tamanhoPagina: request.query.tamanhoPagina,
        status: request.query.status,
        estadoFisico: request.query.estadoFisico,
        tipo: request.query.tipo,
        loteId: request.query.loteId,
        organizacaoId: request.query.organizacaoId,
      });
      return reply.status(200).send({
        dados: resultado.dados.map(serializarEquipamento),
        paginacao: resultado.paginacao,
      });
    },
  );

  servidor.get(
    '/equipamentos/:id',
    {
      preHandler: [exigirPapel(papeisLeitura)],
      schema: {
        tags: ['Equipamentos'],
        summary: 'Obtém detalhes de um equipamento incluindo seu lote e organização (A2-11)',
        params: EquipamentoParamsSchema,
        response: {
          200: EquipamentoDetalheResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const ator = obterUsuarioRequisicao(request);
      const eq = await equipamentoService.buscarPorId(ator, request.params.id);
      return reply.status(200).send(serializarEquipamentoDetalhe(eq));
    },
  );

  servidor.get(
    '/equipamentos/:id/rastreabilidade',
    {
      preHandler: [exigirPapel(papeisLeitura)],
      schema: {
        tags: ['Equipamentos'],
        summary: 'Retorna rastreabilidade completa do equipamento (lote, organização e linha do tempo cronológica de movimentações com usuário responsável)',
        params: EquipamentoParamsSchema,
        response: {
          200: RastreabilidadeEquipamentoResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const ator = obterUsuarioRequisicao(request);
      const rastro = await equipamentoService.obterRastreabilidade(ator, request.params.id);
      return reply.status(200).send({
        equipamento: serializarEquipamento(rastro.equipamento),
        lote: {
          id: rastro.lote.id,
          organizacaoId: rastro.lote.organizacaoId,
          notaFiscal: rastro.lote.notaFiscal,
          transportadora: rastro.lote.transportadora,
          dataEntrada: rastro.lote.dataEntrada.toISOString().slice(0, 10),
        },
        organizacao: rastro.organizacao,
        movimentacoes: rastro.movimentacoes.map((m) => ({
          id: m.id,
          equipamentoId: m.equipamentoId,
          statusAnterior: m.statusAnterior,
          statusNovo: m.statusNovo,
          estadoAnterior: m.estadoAnterior,
          estadoNovo: m.estadoNovo,
          justificativa: m.justificativa,
          usuarioId: m.usuarioId,
          versao: m.versao,
          criadoEm: m.criadoEm.toISOString(),
          usuario: m.usuario,
        })),
      });
    },
  );

  servidor.post(
    '/equipamentos/:id/triagem',
    {
      preHandler: [exigirPapel(papeisEscrita)],
      schema: {
        tags: ['Equipamentos'],
        summary: 'Conclui a triagem de um equipamento em EM_TRIAGEM e move para TRIADO (R9, R7, R4)',
        params: EquipamentoParamsSchema,
        body: RealizarTriagemBodySchema,
        response: {
          200: EquipamentoResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const ator = obterUsuarioRequisicao(request);
      const atualizado = await equipamentoService.realizarTriagem(ator, {
        equipamentoId: request.params.id,
        versao: request.body.versao,
        classificacaoDestino: request.body.classificacaoDestino,
        estadoFisico: request.body.estadoFisico,
        justificativa: request.body.justificativa,
      });
      return reply.status(200).send(serializarEquipamento(atualizado));
    },
  );
}
