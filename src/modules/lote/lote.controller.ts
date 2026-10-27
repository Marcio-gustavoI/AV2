import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Papel } from '../../domain/index.js';
import { exigirPapel, obterUsuarioRequisicao } from '../../plugins/auth.js';
import type { EntidadeEquipamento } from '../equipamento/equipamento.repository.js';
import type { EntidadeLote, EntidadeLoteDetalhe } from './lote.repository.js';
import type { LoteCriadoComEquipamentos, LoteService } from './lote.service.js';
import {
  CriarLoteBodySchema,
  ListaPaginadaLotesResponseSchema,
  ListarLotesQuerySchema,
  LoteCriadoResponseSchema,
  LoteDetalheResponseSchema,
  LoteParamsSchema,
} from './lote.schemas.js';

function formatarDataSomenteDia(data: Date): string {
  return data.toISOString().slice(0, 10);
}

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

function serializarLoteResumo(lote: EntidadeLote) {
  return {
    id: lote.id,
    organizacaoId: lote.organizacaoId,
    notaFiscal: lote.notaFiscal,
    transportadora: lote.transportadora,
    dataEntrada: formatarDataSomenteDia(lote.dataEntrada),
    versao: lote.versao,
    criadoEm: lote.criadoEm.toISOString(),
  };
}

function serializarLoteCriado(lote: LoteCriadoComEquipamentos) {
  return {
    ...serializarLoteResumo(lote),
    equipamentos: lote.equipamentos.map(serializarEquipamento),
  };
}

function serializarLoteDetalhe(lote: EntidadeLoteDetalhe) {
  return {
    ...serializarLoteResumo(lote),
    organizacao: lote.organizacao,
    equipamentos: lote.equipamentos.map(serializarEquipamento),
  };
}

export function registrarRotasLote(app: FastifyInstance, loteService: LoteService): void {
  const servidor = app.withTypeProvider<TypeBoxTypeProvider>();

  const papeisEscrita = [Papel.ADMIN, Papel.GESTOR_ALMOXARIFADO] as const;
  const papeisLeitura = [
    Papel.ADMIN,
    Papel.OPERADOR_CADASTRO,
    Papel.GESTOR_ALMOXARIFADO,
    Papel.AUDITOR,
  ] as const;

  servidor.post(
    '/lotes',
    {
      preHandler: [exigirPapel(papeisEscrita)],
      schema: {
        tags: ['Lotes'],
        summary: 'Registra a chegada de um lote com seus equipamentos em transação atômica (R2, R6, R7, R11)',
        body: CriarLoteBodySchema,
        response: {
          201: LoteCriadoResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const ator = obterUsuarioRequisicao(request);
      const criado = await loteService.criar(ator, {
        organizacaoId: request.body.organizacaoId,
        orgCodigo: request.body.orgCodigo,
        notaFiscal: request.body.notaFiscal,
        transportadora: request.body.transportadora,
        dataEntrada: request.body.dataEntrada,
        equipamentos: request.body.equipamentos,
      });
      return reply.status(201).send(serializarLoteCriado(criado));
    },
  );

  servidor.get(
    '/lotes',
    {
      preHandler: [exigirPapel(papeisLeitura)],
      schema: {
        tags: ['Lotes'],
        summary: 'Lista lotes recebidos com paginação',
        querystring: ListarLotesQuerySchema,
        response: {
          200: ListaPaginadaLotesResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const ator = obterUsuarioRequisicao(request);
      const resultado = await loteService.listar(ator, {
        pagina: request.query.pagina,
        tamanhoPagina: request.query.tamanhoPagina,
        organizacaoId: request.query.organizacaoId,
      });
      return reply.status(200).send({
        dados: resultado.dados.map(serializarLoteResumo),
        paginacao: resultado.paginacao,
      });
    },
  );

  servidor.get(
    '/lotes/:id',
    {
      preHandler: [exigirPapel(papeisLeitura)],
      schema: {
        tags: ['Lotes'],
        summary: 'Obtém detalhes de um lote com sua organização e equipamentos (A2-11)',
        params: LoteParamsSchema,
        response: {
          200: LoteDetalheResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const ator = obterUsuarioRequisicao(request);
      const lote = await loteService.buscarPorId(ator, request.params.id);
      return reply.status(200).send(serializarLoteDetalhe(lote));
    },
  );
}
