import Fastify from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import {
  PrismaAuditoriaRepository,
  PrismaGerenciadorTransacao,
} from './modules/auditoria/auditoria.repository.js';
import { registrarRotasAuth } from './modules/auth/auth.controller.js';
import { AuthService } from './modules/auth/auth.service.js';
import { registrarRotasContrato } from './modules/contrato/contrato.controller.js';
import { PrismaContratoRepository } from './modules/contrato/contrato.repository.js';
import { ContratoService } from './modules/contrato/contrato.service.js';
import { registrarRotasOrganizacao } from './modules/organizacao/organizacao.controller.js';
import { PrismaOrganizacaoRepository } from './modules/organizacao/organizacao.repository.js';
import { OrganizacaoService } from './modules/organizacao/organizacao.service.js';
import { registrarRotasParametro } from './modules/parametro/parametro.controller.js';
import { PrismaParametroRepository } from './modules/parametro/parametro.repository.js';
import { ParametroService } from './modules/parametro/parametro.service.js';
import { registrarRotasUsuario } from './modules/usuario/usuario.controller.js';
import { PrismaUsuarioRepository } from './modules/usuario/usuario.repository.js';
import { UsuarioService } from './modules/usuario/usuario.service.js';
import { registrarHookAutenticacao } from './plugins/auth.js';
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
        usuarioId: request.usuario?.id,
      },
      'request concluída',
    );
  });

  // Segurança HTTP
  await app.register(helmet, {
    contentSecurityPolicy: false, // desabilitado para o Swagger
  });

  // CORS configurável por env
  await app.register(cors, {
    origin: env.CORS_ORIGENS.length > 0 ? env.CORS_ORIGENS : false,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Rate limit (habilitado por rota, ex.: POST /api/v1/auth/login)
  await app.register(rateLimit, {
    global: false,
  });

  // JWT
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: {
      expiresIn: env.JWT_EXPIRA_EM,
    },
  });

  // Error handler e not found
  registrarErrorHandler(app);

  // Hook global de autenticação
  registrarHookAutenticacao(app);

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

  // Instanciação das dependências (Repositórios + Services)
  const transacao = new PrismaGerenciadorTransacao(prisma);
  const auditoriaRepo = new PrismaAuditoriaRepository(prisma);
  const usuarioRepo = new PrismaUsuarioRepository(prisma);
  const parametroRepo = new PrismaParametroRepository(prisma);
  const organizacaoRepo = new PrismaOrganizacaoRepository(prisma);
  const contratoRepo = new PrismaContratoRepository(prisma);

  const authService = new AuthService(
    usuarioRepo,
    {
      assinar: (payload) =>
        app.jwt.sign(payload, {
          expiresIn: env.JWT_EXPIRA_EM,
        }),
    },
    env.JWT_EXPIRA_EM,
  );
  const usuarioService = new UsuarioService(
    usuarioRepo,
    auditoriaRepo,
    transacao,
    env.BCRYPT_ROUNDS,
  );
  const parametroService = new ParametroService(
    parametroRepo,
    auditoriaRepo,
    transacao,
  );
  const organizacaoService = new OrganizacaoService(
    organizacaoRepo,
    auditoriaRepo,
    transacao,
  );
  const contratoService = new ContratoService(
    contratoRepo,
    organizacaoRepo,
    auditoriaRepo,
    transacao,
  );

  // Registro das rotas /api/v1
  await app.register(
    async (api) => {
      registrarRotasAuth(api, authService);
      registrarRotasUsuario(api, usuarioService);
      registrarRotasParametro(api, parametroService);
      registrarRotasOrganizacao(api, organizacaoService);
      registrarRotasContrato(api, contratoService);
    },
    { prefix: '/api/v1' },
  );

  return app;
}
