import { Type, type Static } from '@sinclair/typebox';
import {
  EquipamentoResponseSchema,
  EstadoFisicoSchema,
  StatusEquipamentoSchema,
} from '../equipamento/equipamento.schemas.js';

export const MovimentacaoEquipamentoParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid', description: 'ID do equipamento (UUID)' }),
});
export type MovimentacaoEquipamentoParams = Static<typeof MovimentacaoEquipamentoParamsSchema>;

export const RegistrarMovimentacaoBodySchema = Type.Object(
  {
    versao: Type.Integer({
      minimum: 1,
      description: 'Versão atual do equipamento para controle otimista de concorrência (A2-14)',
    }),
    statusNovo: Type.Optional(StatusEquipamentoSchema),
    estadoNovo: Type.Optional(EstadoFisicoSchema),
    justificativa: Type.Optional(
      Type.Union([
        Type.String({
          description: 'Justificativa (obrigatória com mínimo 10 caracteres quando estado físico cai >= 2 níveis - R4)',
        }),
        Type.Null(),
      ]),
    ),
  },
  { additionalProperties: false },
);
export type RegistrarMovimentacaoBody = Static<typeof RegistrarMovimentacaoBodySchema>;

export const MovimentacaoResponseSchema = Type.Object({
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
});

export const ResultadoMovimentacaoResponseSchema = Type.Object({
  equipamento: EquipamentoResponseSchema,
  movimentacao: MovimentacaoResponseSchema,
});
