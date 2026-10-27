import { Type, type Static } from '@sinclair/typebox';

export const ListarAuditoriaQuerySchema = Type.Object({
  pagina: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  tamanhoPagina: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  usuarioId: Type.Optional(Type.String({ format: 'uuid' })),
  entidade: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  acao: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  dataInicio: Type.Optional(Type.String({ minLength: 10 })),
  dataFim: Type.Optional(Type.String({ minLength: 10 })),
});
export type ListarAuditoriaQuery = Static<typeof ListarAuditoriaQuerySchema>;

export const RegistroAuditoriaResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  usuarioId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  acao: Type.String(),
  entidade: Type.String(),
  entidadeId: Type.String(),
  antes: Type.Union([Type.Record(Type.String(), Type.Unknown()), Type.Null()]),
  depois: Type.Union([Type.Record(Type.String(), Type.Unknown()), Type.Null()]),
  criadoEm: Type.String({ format: 'date-time' }),
});

export const ListaPaginadaAuditoriaResponseSchema = Type.Object({
  dados: Type.Array(RegistroAuditoriaResponseSchema),
  paginacao: Type.Object({
    pagina: Type.Integer(),
    tamanhoPagina: Type.Integer(),
    total: Type.Integer(),
    totalPaginas: Type.Integer(),
  }),
});
