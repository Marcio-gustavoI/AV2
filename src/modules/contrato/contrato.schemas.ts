import { Type, type Static } from '@sinclair/typebox';

export const ContratoOrgParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid', description: 'ID da organização (UUID)' }),
});
export type ContratoOrgParams = Static<typeof ContratoOrgParamsSchema>;

export const CriarContratoBodySchema = Type.Object(
  {
    numero: Type.String({
      minLength: 1,
      maxLength: 80,
      description: 'Número único do contrato',
    }),
    clausulas: Type.Optional(
      Type.Union([Type.Record(Type.String(), Type.Unknown()), Type.Null()]),
    ),
    inicio: Type.String({
      minLength: 10,
      description: 'Data de início do contrato (YYYY-MM-DD ou ISO 8601)',
    }),
    fim: Type.Optional(
      Type.Union([
        Type.String({
          minLength: 10,
          description: 'Data de término do contrato (YYYY-MM-DD ou ISO 8601, >= inicio)',
        }),
        Type.Null(),
      ]),
    ),
  },
  { additionalProperties: false },
);
export type CriarContratoBody = Static<typeof CriarContratoBodySchema>;

export const AtualizarContratoBodySchema = Type.Object(
  {
    versao: Type.Integer({
      minimum: 1,
      description: 'Versão atual do contrato para controle de concorrência otimista',
    }),
    numero: Type.Optional(
      Type.String({
        minLength: 1,
        maxLength: 80,
        description: 'Novo número único do contrato',
      }),
    ),
    clausulas: Type.Optional(
      Type.Union([Type.Record(Type.String(), Type.Unknown()), Type.Null()]),
    ),
    inicio: Type.Optional(
      Type.String({
        minLength: 10,
        description: 'Nova data de início do contrato (YYYY-MM-DD)',
      }),
    ),
    fim: Type.Optional(
      Type.Union([
        Type.String({
          minLength: 10,
          description: 'Nova data de término do contrato (YYYY-MM-DD)',
        }),
        Type.Null(),
      ]),
    ),
  },
  { additionalProperties: false },
);
export type AtualizarContratoBody = Static<typeof AtualizarContratoBodySchema>;

export const ContratoResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  organizacaoId: Type.String({ format: 'uuid' }),
  numero: Type.String(),
  clausulas: Type.Union([Type.Record(Type.String(), Type.Unknown()), Type.Null()]),
  inicio: Type.String(),
  fim: Type.Union([Type.String(), Type.Null()]),
  versao: Type.Integer(),
});
