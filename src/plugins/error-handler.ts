import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ErroDominio, type Severidade } from '../domain/index.js';
import { logger } from '../lib/logger.js';

interface ErroResposta {
  erro: string;
  mensagem: string;
  severidade: Severidade;
  detalhes?: unknown[];
}

function buildError(
  code: string,
  mensagem: string,
  severidade: Severidade,
  detalhes?: unknown[],
): ErroResposta {
  return {
    erro: code,
    mensagem,
    severidade,
    ...(detalhes !== undefined && detalhes.length > 0 ? { detalhes } : {}),
  };
}

interface ErroPrismaLike {
  code?: unknown;
  meta?: { target?: unknown } | undefined;
  message?: unknown;
}

function extrairCodigoPrisma(err: unknown): string | null {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as ErroPrismaLike).code;
    if (typeof code === 'string' && /^P\d{4}$/.test(code)) {
      return code;
    }
  }
  return null;
}

export function registrarErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(
    (error: FastifyError | ErroDominio | Error, request: FastifyRequest, reply: FastifyReply) => {
      // 1. Erros de domínio tipados (400, 401, 403, 404, 409, 422)
      if (error instanceof ErroDominio) {
        logger.warn(
          { reqId: request.id, codigo: error.codigo, statusHttp: error.statusHttp },
          error.message,
        );
        void reply
          .status(error.statusHttp)
          .send(buildError(error.codigo, error.message, error.severidade, error.detalhes));
        return;
      }

      // 2. Erros do Prisma mapeados (P2002 -> 409, P2025 -> 404)
      const prismaCode = extrairCodigoPrisma(error);
      if (prismaCode === 'P2002') {
        const meta = (error as ErroPrismaLike).meta;
        const target = Array.isArray(meta?.target) ? meta.target.join(', ') : 'campo único';
        void reply
          .status(409)
          .send(
            buildError(
              'CONFLITO_UNICIDADE',
              `Já existe um registro com o mesmo valor em: ${target}.`,
              'AVISO',
            ),
          );
        return;
      }

      if (prismaCode === 'P2025') {
        void reply
          .status(404)
          .send(buildError('NAO_ENCONTRADO', 'Registro solicitado não foi encontrado.', 'AVISO'));
        return;
      }

      // 3. Erros de validação JSON Schema do Fastify/TypeBox
      const fastifyErr = error as FastifyError;
      if (fastifyErr.validation) {
        void reply
          .status(400)
          .send(
            buildError(
              'VALIDACAO_INVALIDA',
              'Dados de entrada inválidos.',
              'AVISO',
              fastifyErr.validation,
            ),
          );
        return;
      }

      // 4. Rate limit
      if (fastifyErr.statusCode === 429) {
        void reply
          .status(429)
          .send(
            buildError(
              'LIMITE_REQUISICOES',
              'Muitas requisições. Tente novamente em instantes.',
              'AVISO',
            ),
          );
        return;
      }

      // 5. JWT / autenticação do Fastify
      if (fastifyErr.statusCode === 401) {
        void reply
          .status(401)
          .send(buildError('NAO_AUTENTICADO', 'Token ausente, inválido ou expirado.', 'ERRO'));
        return;
      }

      // 6. Erros inesperados — nunca vazar stack trace ou SQL ao cliente
      logger.error({ err: error, reqId: request.id }, 'Erro interno não tratado');
      void reply
        .status(500)
        .send(
          buildError(
            'ERRO_INTERNO',
            'Ocorreu um erro interno. Nossa equipe foi notificada.',
            'CRITICO',
          ),
        );
    },
  );

  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    void reply
      .status(404)
      .send(
        buildError(
          'ROTA_NAO_ENCONTRADA',
          `Rota ${request.method} ${request.url} não encontrada.`,
          'AVISO',
        ),
      );
  });
}
