import { Type, type Static } from '@sinclair/typebox';
import { Papel } from '../../domain/index.js';

const PapelSchema = Type.Union([
  Type.Literal(Papel.ADMIN),
  Type.Literal(Papel.OPERADOR_CADASTRO),
  Type.Literal(Papel.GESTOR_ALMOXARIFADO),
  Type.Literal(Papel.AUDITOR),
]);

export const LoginBodySchema = Type.Object(
  {
    email: Type.String({
      minLength: 3,
      maxLength: 255,
      description: 'E-mail do usuário',
    }),
    senha: Type.String({
      minLength: 1,
      maxLength: 200,
      description: 'Senha em texto plano',
    }),
  },
  { additionalProperties: false },
);
export type LoginBody = Static<typeof LoginBodySchema>;

export const TokenResponseSchema = Type.Object({
  token: Type.String({ description: 'Token JWT Bearer' }),
  expiraEm: Type.String({ description: 'Tempo de expiração configurado (ex.: 30m)' }),
  usuario: Type.Object({
    id: Type.String({ format: 'uuid' }),
    email: Type.String(),
    papel: PapelSchema,
  }),
});

export const PerfilMeResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  email: Type.String(),
  papel: PapelSchema,
  permissoes: Type.Array(Type.String()),
});
