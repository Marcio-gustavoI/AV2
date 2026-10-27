import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ErroNaoAutenticado, ErroSemPermissao, Papel } from '../domain/index.js';

export interface UsuarioAutenticado {
  id: string;
  papel: Papel;
}

declare module 'fastify' {
  interface FastifyRequest {
    usuario?: UsuarioAutenticado;
  }
}

const PAPEIS_VALIDOS = new Set<string>(Object.values(Papel));

function rotaPublica(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  return (
    path === '/saude' ||
    path === '/api/v1/auth/login' ||
    path.startsWith('/docs')
  );
}

/**
 * Hook de autenticação e helper `exigirPapel` (Fase 4: suporta cabeçalho de teste
 * apenas em NODE_ENV=test; na Fase 5 será conectado ao @fastify/jwt real).
 */
export function registrarHookAutenticacao(app: FastifyInstance): void {
  app.addHook('onRequest', async (request: FastifyRequest) => {
    if (!request.routeOptions.url || rotaPublica(request.url)) {
      return;
    }

    // Modo de teste (Fase 4): aceita cabeçalhos x-test-user-id e x-test-user-role
    if (process.env['NODE_ENV'] === 'test') {
      const testRole = request.headers['x-test-user-role'];
      const testUserId = request.headers['x-test-user-id'];
      if (typeof testRole === 'string' && PAPEIS_VALIDOS.has(testRole)) {
        request.usuario = {
          id:
            typeof testUserId === 'string' && testUserId.trim() !== ''
              ? testUserId.trim()
              : '00000000-0000-0000-0000-000000000001',
          papel: testRole as Papel,
        };
        return;
      }
    }

    if (!request.usuario) {
      throw new ErroNaoAutenticado();
    }
  });
}

export function exigirPapel(papeisPermitidos: readonly Papel[]) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.usuario) {
      throw new ErroNaoAutenticado();
    }
    if (!papeisPermitidos.includes(request.usuario.papel)) {
      throw new ErroSemPermissao();
    }
  };
}

export function obterUsuarioRequisicao(request: FastifyRequest): UsuarioAutenticado {
  if (!request.usuario) {
    throw new ErroNaoAutenticado();
  }
  return request.usuario;
}
