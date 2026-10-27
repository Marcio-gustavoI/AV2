import 'dotenv/config';
import { buildApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';

async function start(): Promise<void> {
  const app = await buildApp();

  // Graceful shutdown (A2-05)
  let isShuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (isShuttingDown) {
      logger.warn({ signal }, 'Segundo sinal recebido — forçando saída imediata');
      process.exit(1);
    }
    isShuttingDown = true;
    logger.info({ signal }, 'Sinal de encerramento recebido. Iniciando graceful shutdown...');

    const timeout = setTimeout(() => {
      logger.fatal('Timeout de shutdown atingido. Forçando saída.');
      process.exit(1);
    }, env.SHUTDOWN_TIMEOUT_MS);

    try {
      await app.close();
      await prisma.$disconnect();
      logger.info('Servidor e conexões encerrados com sucesso.');
      clearTimeout(timeout);
      process.exit(0);
    } catch (err) {
      logger.fatal({ err }, 'Erro durante o shutdown.');
      clearTimeout(timeout);
      process.exit(1);
    }
  }

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  if (process.platform === 'win32') {
    process.on('SIGBREAK', () => void shutdown('SIGBREAK'));
  }

  // Suporte adicional para sinal enviado via IPC em testes automatizados no Windows
  process.on('message', (msg) => {
    if (msg === 'SIGINT' || msg === 'SIGTERM') {
      void shutdown(msg);
    }
  });

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    logger.info(`🚀 greencode rodando em http://${env.HOST}:${env.PORT}`);
    logger.info(`📖 Documentação: http://${env.HOST}:${env.PORT}/docs`);
    if (typeof process.send === 'function') {
      process.send('PRONTO');
    }
  } catch (err) {
    logger.fatal({ err }, 'Falha ao iniciar o servidor');
    process.exit(1);
  }
}

void start();
