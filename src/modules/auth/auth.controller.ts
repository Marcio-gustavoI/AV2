import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { obterUsuarioRequisicao } from '../../plugins/auth.js';
import type { AuthService } from './auth.service.js';
import {
  LoginBodySchema,
  PerfilMeResponseSchema,
  TokenResponseSchema,
} from './auth.schemas.js';

export function registrarRotasAuth(app: FastifyInstance, authService: AuthService): void {
  const servidor = app.withTypeProvider<TypeBoxTypeProvider>();

  servidor.post(
    '/auth/login',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
        },
      },
      schema: {
        tags: ['Autenticação'],
        summary: 'Autentica usuário e emite JWT com rate-limit de 5 tentativas/minuto',
        body: LoginBodySchema,
        response: {
          200: TokenResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const resultado = await authService.login(request.body.email, request.body.senha);
      return reply.status(200).send(resultado);
    },
  );

  servidor.post(
    '/auth/renovar',
    {
      schema: {
        tags: ['Autenticação'],
        summary: 'Renova um JWT ainda válido emitindo novo token (simulação de inatividade)',
        response: {
          200: TokenResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const ator = obterUsuarioRequisicao(request);
      const resultado = await authService.renovar(ator);
      return reply.status(200).send(resultado);
    },
  );

  servidor.get(
    '/auth/me',
    {
      schema: {
        tags: ['Autenticação'],
        summary: 'Retorna perfil do usuário autenticado e lista de permissões do papel (A1-19)',
        response: {
          200: PerfilMeResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const ator = obterUsuarioRequisicao(request);
      const perfil = await authService.obterPerfil(ator);
      return reply.status(200).send({
        id: perfil.id,
        email: perfil.email,
        papel: perfil.papel,
        permissoes: [...perfil.permissoes],
      });
    },
  );
}
