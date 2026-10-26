import Fastify from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { registrarErrorHandler } from './plugins/error-handler.js';

export async function buildApp() {
  const app = Fastify({
    logger: false, // usamos nosso próprio logger pino
    genReqId: () => crypto.randomUUID(),
  }).withTypeProvider<TypeBoxTypeProvider>();

  // Hook de log de requisições
  app.addHook('onRequest', async (request) => {
    logger.info(
      { reqId: request.id, method: request.method, url: request.url },
      'request recebida',
    );
  });

  app.addHook('onResponse', async (request, reply) => {
    logger.info(
      {
        reqId: request.id,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime,
      },
      'request concluída',
    );
  });

  // Segurança
  await app.register(helmet, {
    contentSecurityPolicy: false, // desabilitado para o Swagger
  });

  // CORS configurável por env
  await app.register(cors, {
    origin: env.CORS_ORIGENS.length > 0 ? env.CORS_ORIGENS : false,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Error handler e not found
  registrarErrorHandler(app);

  // Rota pública de saúde (sem prefixo /api/v1)
  app.get(
    '/saude',
    {
      schema: {
        tags: ['Sistema'],
        summary: 'Verifica saúde do servidor',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
              versao: { type: 'string' },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      return reply.status(200).send({
        status: 'ok',
        timestamp: new Date().toISOString(),
        versao: '1.0.0',
      });
    },
  );

  return app;
}
