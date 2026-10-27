import { Type, type Static } from '@sinclair/typebox';
import {
  ClassificacaoDestino,
  EstadoFisico,
  StatusEquipamento,
  TipoEquipamento,
} from '../../domain/index.js';

const TipoEquipamentoSchema = Type.Union([
  Type.Literal(TipoEquipamento.DESKTOP),
  Type.Literal(TipoEquipamento.NOTEBOOK),
  Type.Literal(TipoEquipamento.MONITOR),
  Type.Literal(TipoEquipamento.SERVIDOR),
  Type.Literal(TipoEquipamento.PERIFERICO),
  Type.Literal(TipoEquipamento.REDE),
  Type.Literal(TipoEquipamento.OUTRO),
]);

const EstadoFisicoSchema = Type.Union([
  Type.Literal(EstadoFisico.SUCATA),
  Type.Literal(EstadoFisico.RUIM),
  Type.Literal(EstadoFisico.REGULAR),
  Type.Literal(EstadoFisico.BOM),
  Type.Literal(EstadoFisico.EXCELENTE),
]);

const StatusEquipamentoSchema = Type.Union([
  Type.Literal(StatusEquipamento.RECEBIDO),
  Type.Literal(StatusEquipamento.EM_TRIAGEM),
  Type.Literal(StatusEquipamento.TRIADO),
  Type.Literal(StatusEquipamento.EM_DESMONTE),
  Type.Literal(StatusEquipamento.DESMONTADO),
  Type.Literal(StatusEquipamento.DESTINADO),
]);

const ClassificacaoDestinoNullableSchema = Type.Union([
  Type.Literal(ClassificacaoDestino.REUTILIZACAO),
  Type.Literal(ClassificacaoDestino.RECICLAGEM),
  Type.Literal(ClassificacaoDestino.DESCARTE_SEGURO),
  Type.Null(),
]);

export const LoteParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid', description: 'ID do lote (UUID)' }),
});
export type LoteParams = Static<typeof LoteParamsSchema>;

export const EquipamentoItemCriacaoLoteSchema = Type.Object(
  {
    tipo: TipoEquipamentoSchema,
    descricao: Type.String({ minLength: 1, maxLength: 500 }),
    estadoFisico: EstadoFisicoSchema,
    valorAquisicao: Type.Optional(
      Type.Union([Type.Number({ minimum: 0 }), Type.String({ minLength: 1 }), Type.Null()]),
    ),
    codigoBarrasInterno: Type.Optional(Type.String({ minLength: 3, maxLength: 50 })),
  },
  { additionalProperties: false },
);

export const CriarLoteBodySchema = Type.Object(
  {
    organizacaoId: Type.Optional(Type.String({ format: 'uuid' })),
    orgCodigo: Type.Optional(Type.String({ minLength: 1, maxLength: 50 })),
    notaFiscal: Type.String({ minLength: 1, maxLength: 100 }),
    transportadora: Type.String({ minLength: 1, maxLength: 200 }),
    dataEntrada: Type.String({
      minLength: 10,
      description: 'Data de entrada do lote (YYYY-MM-DD ou ISO 8601, respeitando janela R2 de 0..90 dias)',
    }),
    equipamentos: Type.Optional(Type.Array(EquipamentoItemCriacaoLoteSchema)),
  },
  { additionalProperties: false },
);
export type CriarLoteBody = Static<typeof CriarLoteBodySchema>;

export const ListarLotesQuerySchema = Type.Object({
  pagina: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  tamanhoPagina: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  organizacaoId: Type.Optional(Type.String({ format: 'uuid' })),
});
export type ListarLotesQuery = Static<typeof ListarLotesQuerySchema>;

export const EquipamentoEmLoteResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  loteId: Type.String({ format: 'uuid' }),
  codigoBarrasInterno: Type.String(),
  tipo: TipoEquipamentoSchema,
  descricao: Type.String(),
  valorAquisicao: Type.Union([Type.String(), Type.Null()]),
  estadoFisico: EstadoFisicoSchema,
  status: StatusEquipamentoSchema,
  triagemCompleta: Type.Boolean(),
  classificacaoDestino: ClassificacaoDestinoNullableSchema,
  versao: Type.Integer(),
  criadoEm: Type.String({ format: 'date-time' }),
});

export const LoteResumoResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  organizacaoId: Type.String({ format: 'uuid' }),
  notaFiscal: Type.String(),
  transportadora: Type.String(),
  dataEntrada: Type.String(),
  versao: Type.Integer(),
  criadoEm: Type.String({ format: 'date-time' }),
});

export const LoteCriadoResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  organizacaoId: Type.String({ format: 'uuid' }),
  notaFiscal: Type.String(),
  transportadora: Type.String(),
  dataEntrada: Type.String(),
  versao: Type.Integer(),
  criadoEm: Type.String({ format: 'date-time' }),
  equipamentos: Type.Array(EquipamentoEmLoteResponseSchema),
});

export const LoteDetalheResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  organizacaoId: Type.String({ format: 'uuid' }),
  notaFiscal: Type.String(),
  transportadora: Type.String(),
  dataEntrada: Type.String(),
  versao: Type.Integer(),
  criadoEm: Type.String({ format: 'date-time' }),
  organizacao: Type.Object({
    id: Type.String({ format: 'uuid' }),
    codigo: Type.String(),
    cnpj: Type.String(),
    nome: Type.String(),
  }),
  equipamentos: Type.Array(EquipamentoEmLoteResponseSchema),
});

export const ListaPaginadaLotesResponseSchema = Type.Object({
  dados: Type.Array(LoteResumoResponseSchema),
  paginacao: Type.Object({
    pagina: Type.Integer(),
    tamanhoPagina: Type.Integer(),
    total: Type.Integer(),
    totalPaginas: Type.Integer(),
  }),
});
