import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../lib/logger.js';

type Severidade = 'AVISO' | 'ERRO' | 'CRITICO';

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
  return { erro: code, mensagem, severidade, ...(detalhes ? { detalhes } : {}) };
}

export function registrarErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(
    (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
      // Erros de validação do Fastify/TypeBox
      if (error.validation) {
        void reply.status(400).send(
          buildError(
            'VALIDACAO_INVALIDA',
            'Dados de entrada inválidos.',
            'AVISO',
            error.validation,
          ),
        );
        return;
      }

      // Rate limit
      if (error.statusCode === 429) {
        void reply.status(429).send(
          buildError('LIMITE_REQUISICOES', 'Muitas requisições. Tente novamente em instantes.', 'AVISO'),
        );
        return;
      }

      // JWT / autenticação
      if (error.statusCode === 401) {
        void reply.status(401).send(
          buildError('NAO_AUTENTICADO', 'Token ausente, inválido ou expirado.', 'ERRO'),
        );
        return;
      }

      // Erros inesperados — nunca vazar stack trace ao cliente
      logger.error({ err: error, reqId: request.id }, 'Erro interno não tratado');
      void reply.status(500).send(
        buildError(
          'ERRO_INTERNO',
          'Ocorreu um erro interno. Nossa equipe foi notificada.',
          'CRITICO',
        ),
      );
    },
  );

  // 404 para rotas não encontradas
  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    void reply.status(404).send(
      buildError(
        'ROTA_NAO_ENCONTRADA',
        `Rota ${request.method} ${request.url} não encontrada.`,
        'AVISO',
      ),
    );
  });
}
