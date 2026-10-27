import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import '@fastify/jwt';
import { ErroNaoAutenticado, ErroSemPermissao, Papel } from '../domain/index.js';

export interface UsuarioAutenticado {
  id: string;
  papel: Papel;
}

export interface PayloadTokenJwt {
  sub: string;
  papel: Papel;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: PayloadTokenJwt;
    user: PayloadTokenJwt;
  }
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
 * Hook global de autenticação (Fase 5, A2-12):
 * Valida o token Bearer via `@fastify/jwt` e injeta `request.usuario = { id, papel }`.
 */
export function registrarHookAutenticacao(app: FastifyInstance): void {
  app.addHook('onRequest', async (request: FastifyRequest) => {
    if (!request.routeOptions.url || rotaPublica(request.url)) {
      return;
    }

    try {
      const decodificado = await request.jwtVerify<PayloadTokenJwt>();
      if (
        !decodificado ||
        typeof decodificado.sub !== 'string' ||
        decodificado.sub.trim() === '' ||
        typeof decodificado.papel !== 'string' ||
        !PAPEIS_VALIDOS.has(decodificado.papel)
      ) {
        throw new ErroNaoAutenticado('Token JWT malformado.');
      }

      request.usuario = {
        id: decodificado.sub,
        papel: decodificado.papel as Papel,
      };
    } catch (err) {
      if (err instanceof ErroNaoAutenticado) {
        throw err;
      }
      throw new ErroNaoAutenticado('Token de autenticação ausente, inválido ou expirado.');
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
