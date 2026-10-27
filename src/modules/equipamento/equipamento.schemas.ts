import { Type, type Static } from '@sinclair/typebox';
import {
  ClassificacaoDestino,
  EstadoFisico,
  Papel,
  StatusEquipamento,
  TipoEquipamento,
} from '../../domain/index.js';

export const TipoEquipamentoSchema = Type.Union([
  Type.Literal(TipoEquipamento.DESKTOP),
  Type.Literal(TipoEquipamento.NOTEBOOK),
  Type.Literal(TipoEquipamento.MONITOR),
  Type.Literal(TipoEquipamento.SERVIDOR),
  Type.Literal(TipoEquipamento.PERIFERICO),
  Type.Literal(TipoEquipamento.REDE),
  Type.Literal(TipoEquipamento.OUTRO),
]);

export const EstadoFisicoSchema = Type.Union([
  Type.Literal(EstadoFisico.SUCATA),
  Type.Literal(EstadoFisico.RUIM),
  Type.Literal(EstadoFisico.REGULAR),
  Type.Literal(EstadoFisico.BOM),
  Type.Literal(EstadoFisico.EXCELENTE),
]);

export const StatusEquipamentoSchema = Type.Union([
  Type.Literal(StatusEquipamento.RECEBIDO),
  Type.Literal(StatusEquipamento.EM_TRIAGEM),
  Type.Literal(StatusEquipamento.TRIADO),
  Type.Literal(StatusEquipamento.EM_DESMONTE),
  Type.Literal(StatusEquipamento.DESMONTADO),
  Type.Literal(StatusEquipamento.DESTINADO),
]);

export const ClassificacaoDestinoSchema = Type.Union([
  Type.Literal(ClassificacaoDestino.REUTILIZACAO),
  Type.Literal(ClassificacaoDestino.RECICLAGEM),
  Type.Literal(ClassificacaoDestino.DESCARTE_SEGURO),
]);

const PapelSchema = Type.Union([
  Type.Literal(Papel.ADMIN),
  Type.Literal(Papel.OPERADOR_CADASTRO),
  Type.Literal(Papel.GESTOR_ALMOXARIFADO),
  Type.Literal(Papel.AUDITOR),
]);

export const EquipamentoParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid', description: 'ID do equipamento (UUID)' }),
});
export type EquipamentoParams = Static<typeof EquipamentoParamsSchema>;

export const CriarEquipamentoBodySchema = Type.Object(
  {
    loteId: Type.String({ format: 'uuid', description: 'ID do lote ao qual o equipamento pertence (R11)' }),
    tipo: TipoEquipamentoSchema,
    descricao: Type.String({ minLength: 1, maxLength: 500 }),
    estadoFisico: EstadoFisicoSchema,
    valorAquisicao: Type.Optional(
      Type.Union([Type.Number({ minimum: 0 }), Type.String({ minLength: 1 }), Type.Null()]),
    ),
    codigoBarrasInterno: Type.Optional(
      Type.String({
        minLength: 3,
        maxLength: 50,
        description: 'Código de barras opcional (se omitido, gerado automaticamente via sequence GC-000001 - R6)',
      }),
    ),
  },
  { additionalProperties: false },
);
export type CriarEquipamentoBody = Static<typeof CriarEquipamentoBodySchema>;

export const RealizarTriagemBodySchema = Type.Object(
  {
    versao: Type.Integer({
      minimum: 1,
      description: 'Versão atual do equipamento para controle de concorrência otimista',
    }),
    classificacaoDestino: ClassificacaoDestinoSchema,
    estadoFisico: EstadoFisicoSchema,
    justificativa: Type.Optional(
      Type.Union([
        Type.String({
          description: 'Justificativa (obrigatória com mínimo 10 caracteres se estado físico cair >= 2 níveis - R4)',
        }),
        Type.Null(),
      ]),
    ),
  },
  { additionalProperties: false },
);
export type RealizarTriagemBody = Static<typeof RealizarTriagemBodySchema>;

export const ListarEquipamentosQuerySchema = Type.Object({
  pagina: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  tamanhoPagina: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  status: Type.Optional(StatusEquipamentoSchema),
  estadoFisico: Type.Optional(EstadoFisicoSchema),
  tipo: Type.Optional(TipoEquipamentoSchema),
  loteId: Type.Optional(Type.String({ format: 'uuid' })),
  organizacaoId: Type.Optional(Type.String({ format: 'uuid' })),
});
export type ListarEquipamentosQuery = Static<typeof ListarEquipamentosQuerySchema>;

export const EquipamentoResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  loteId: Type.String({ format: 'uuid' }),
  codigoBarrasInterno: Type.String(),
  tipo: TipoEquipamentoSchema,
  descricao: Type.String(),
  valorAquisicao: Type.Union([Type.String(), Type.Null()]),
  estadoFisico: EstadoFisicoSchema,
  status: StatusEquipamentoSchema,
  triagemCompleta: Type.Boolean(),
  classificacaoDestino: Type.Union([ClassificacaoDestinoSchema, Type.Null()]),
  versao: Type.Integer(),
  criadoEm: Type.String({ format: 'date-time' }),
});

export const EquipamentoDetalheResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  loteId: Type.String({ format: 'uuid' }),
  codigoBarrasInterno: Type.String(),
  tipo: TipoEquipamentoSchema,
  descricao: Type.String(),
  valorAquisicao: Type.Union([Type.String(), Type.Null()]),
  estadoFisico: EstadoFisicoSchema,
  status: StatusEquipamentoSchema,
  triagemCompleta: Type.Boolean(),
  classificacaoDestino: Type.Union([ClassificacaoDestinoSchema, Type.Null()]),
  versao: Type.Integer(),
  criadoEm: Type.String({ format: 'date-time' }),
  lote: Type.Object({
    id: Type.String({ format: 'uuid' }),
    organizacaoId: Type.String({ format: 'uuid' }),
    notaFiscal: Type.String(),
    transportadora: Type.String(),
    dataEntrada: Type.String(),
    organizacao: Type.Object({
      id: Type.String({ format: 'uuid' }),
      codigo: Type.String(),
      cnpj: Type.String(),
      nome: Type.String(),
    }),
  }),
});

export const RastreabilidadeEquipamentoResponseSchema = Type.Object({
  equipamento: EquipamentoResponseSchema,
  lote: Type.Object({
    id: Type.String({ format: 'uuid' }),
    organizacaoId: Type.String({ format: 'uuid' }),
    notaFiscal: Type.String(),
    transportadora: Type.String(),
    dataEntrada: Type.String(),
  }),
  organizacao: Type.Object({
    id: Type.String({ format: 'uuid' }),
    codigo: Type.String(),
    cnpj: Type.String(),
    nome: Type.String(),
  }),
  movimentacoes: Type.Array(
    Type.Object({
      id: Type.String({ format: 'uuid' }),
      equipamentoId: Type.String({ format: 'uuid' }),
      statusAnterior: StatusEquipamentoSchema,
      statusNovo: StatusEquipamentoSchema,
      estadoAnterior: EstadoFisicoSchema,
      estadoNovo: EstadoFisicoSchema,
      justificativa: Type.Union([Type.String(), Type.Null()]),
      usuarioId: Type.String({ format: 'uuid' }),
      versao: Type.Integer(),
      criadoEm: Type.String({ format: 'date-time' }),
      usuario: Type.Object({
        id: Type.String({ format: 'uuid' }),
        email: Type.String(),
        papel: PapelSchema,
      }),
    }),
  ),
});

export const ListaPaginadaEquipamentosResponseSchema = Type.Object({
  dados: Type.Array(EquipamentoResponseSchema),
  paginacao: Type.Object({
    pagina: Type.Integer(),
    tamanhoPagina: Type.Integer(),
    total: Type.Integer(),
    totalPaginas: Type.Integer(),
  }),
});
