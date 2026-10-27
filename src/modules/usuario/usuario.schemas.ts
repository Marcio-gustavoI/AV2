import { Type, type Static } from '@sinclair/typebox';
import { Papel } from '../../domain/index.js';

const PapelSchema = Type.Union([
  Type.Literal(Papel.ADMIN),
  Type.Literal(Papel.OPERADOR_CADASTRO),
  Type.Literal(Papel.GESTOR_ALMOXARIFADO),
  Type.Literal(Papel.AUDITOR),
]);

export const UsuarioParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid', description: 'ID do usuário (UUID)' }),
});
export type UsuarioParams = Static<typeof UsuarioParamsSchema>;

export const CriarUsuarioBodySchema = Type.Object(
  {
    email: Type.String({
      minLength: 3,
      maxLength: 255,
      description: 'E-mail único do usuário (normalizado em minúsculas)',
    }),
    senha: Type.String({
      minLength: 1,
      maxLength: 200,
      description: 'Senha em texto plano (mínimo 10 caracteres, com letras e números - R12)',
    }),
    papel: PapelSchema,
    ativo: Type.Optional(Type.Boolean({ default: true })),
  },
  { additionalProperties: false },
);
export type CriarUsuarioBody = Static<typeof CriarUsuarioBodySchema>;

export const AtualizarUsuarioBodySchema = Type.Object(
  {
    versao: Type.Integer({
      minimum: 1,
      description: 'Versão atual do usuário para controle otimista de concorrência',
    }),
    email: Type.Optional(Type.String({ minLength: 3, maxLength: 255 })),
    senha: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    papel: Type.Optional(PapelSchema),
    ativo: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
export type AtualizarUsuarioBody = Static<typeof AtualizarUsuarioBodySchema>;

export const ListarUsuariosQuerySchema = Type.Object({
  pagina: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  tamanhoPagina: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
});
export type ListarUsuariosQuery = Static<typeof ListarUsuariosQuerySchema>;

export const UsuarioResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  email: Type.String(),
  papel: PapelSchema,
  ativo: Type.Boolean(),
  versao: Type.Integer(),
  criadoEm: Type.String({ format: 'date-time' }),
});

export const ListaPaginadaUsuariosResponseSchema = Type.Object({
  dados: Type.Array(UsuarioResponseSchema),
  paginacao: Type.Object({
    pagina: Type.Integer(),
    tamanhoPagina: Type.Integer(),
    total: Type.Integer(),
    totalPaginas: Type.Integer(),
  }),
});
