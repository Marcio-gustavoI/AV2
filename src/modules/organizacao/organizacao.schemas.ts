import { Type, type Static } from '@sinclair/typebox';

export const OrganizacaoParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid', description: 'ID da organização (UUID)' }),
});
export type OrganizacaoParams = Static<typeof OrganizacaoParamsSchema>;

export const CriarOrganizacaoBodySchema = Type.Object(
  {
    codigo: Type.String({
      minLength: 1,
      maxLength: 50,
      description: 'Código interno único da organização (ex.: BR001)',
    }),
    cnpj: Type.String({
      minLength: 14,
      maxLength: 18,
      description: 'CNPJ com ou sem máscara (14 caracteres alfanuméricos após normalização)',
    }),
    nome: Type.String({
      minLength: 1,
      maxLength: 255,
      description: 'Razão social ou nome da organização',
    }),
  },
  { additionalProperties: false },
);
export type CriarOrganizacaoBody = Static<typeof CriarOrganizacaoBodySchema>;

export const AtualizarOrganizacaoBodySchema = Type.Object(
  {
    versao: Type.Integer({
      minimum: 1,
      description: 'Versão atual do registro para controle de concorrência otimista',
    }),
    codigo: Type.Optional(
      Type.String({
        minLength: 1,
        maxLength: 50,
        description: 'Novo código interno único da organização',
      }),
    ),
    nome: Type.Optional(
      Type.String({
        minLength: 1,
        maxLength: 255,
        description: 'Novo nome da organização',
      }),
    ),
  },
  { additionalProperties: false },
);
export type AtualizarOrganizacaoBody = Static<typeof AtualizarOrganizacaoBodySchema>;

export const ListarOrganizacoesQuerySchema = Type.Object({
  pagina: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  tamanhoPagina: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
});
export type ListarOrganizacoesQuery = Static<typeof ListarOrganizacoesQuerySchema>;

export const OrganizacaoResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  codigo: Type.String(),
  cnpj: Type.String(),
  nome: Type.String(),
  versao: Type.Integer(),
  criadoEm: Type.String({ format: 'date-time' }),
});

export const ContratoResumoEmOrganizacaoSchema = Type.Union([
  Type.Object({
    id: Type.String({ format: 'uuid' }),
    organizacaoId: Type.String({ format: 'uuid' }),
    numero: Type.String(),
    clausulas: Type.Union([Type.Record(Type.String(), Type.Unknown()), Type.Null()]),
    inicio: Type.String(),
    fim: Type.Union([Type.String(), Type.Null()]),
    versao: Type.Integer(),
  }),
  Type.Null(),
]);

export const OrganizacaoDetalheResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  codigo: Type.String(),
  cnpj: Type.String(),
  nome: Type.String(),
  versao: Type.Integer(),
  criadoEm: Type.String({ format: 'date-time' }),
  contrato: ContratoResumoEmOrganizacaoSchema,
});

export const ListaPaginadaOrganizacoesResponseSchema = Type.Object({
  dados: Type.Array(OrganizacaoResponseSchema),
  paginacao: Type.Object({
    pagina: Type.Integer(),
    tamanhoPagina: Type.Integer(),
    total: Type.Integer(),
    totalPaginas: Type.Integer(),
  }),
});
