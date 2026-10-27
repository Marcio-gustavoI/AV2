import { Type, type Static } from '@sinclair/typebox';

export const ParametroChaveParamsSchema = Type.Object({
  chave: Type.String({
    minLength: 2,
    maxLength: 100,
    description: 'Chave do parâmetro (ex.: ALIQUOTA_IMPOSTO, COEF_DEPRECIACAO_NOTEBOOK)',
  }),
});
export type ParametroChaveParams = Static<typeof ParametroChaveParamsSchema>;

export const DefinirParametroPorChaveBodySchema = Type.Object(
  {
    valor: Type.Union([Type.Number({ minimum: 0 }), Type.String({ minLength: 1 })]),
    versao: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false },
);
export type DefinirParametroPorChaveBody = Static<typeof DefinirParametroPorChaveBodySchema>;

export const DefinirParametrosLoteBodySchema = Type.Object(
  {
    parametros: Type.Array(
      Type.Object(
        {
          chave: Type.String({ minLength: 2, maxLength: 100 }),
          valor: Type.Union([Type.Number({ minimum: 0 }), Type.String({ minLength: 1 })]),
          versao: Type.Optional(Type.Integer({ minimum: 1 })),
        },
        { additionalProperties: false },
      ),
      { minItems: 1 },
    ),
  },
  { additionalProperties: false },
);
export type DefinirParametrosLoteBody = Static<typeof DefinirParametrosLoteBodySchema>;

export const ParametroResponseSchema = Type.Object({
  chave: Type.String(),
  valor: Type.String(),
  versao: Type.Integer(),
  atualizadoEm: Type.String({ format: 'date-time' }),
});

export const ListaParametrosResponseSchema = Type.Object({
  dados: Type.Array(ParametroResponseSchema),
});
