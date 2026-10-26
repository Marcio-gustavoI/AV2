import 'dotenv/config';
import { buildApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';

async function start(): Promise<void> {
  const app = await buildApp();

  // Graceful shutdown
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
      logger.info('Servidor encerrado com sucesso.');
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
  // SIGBREAK disponível no Windows
  if (process.platform === 'win32') {
    process.on('SIGBREAK', () => void shutdown('SIGBREAK'));
  }

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    logger.info(`🚀 greencode rodando em http://${env.HOST}:${env.PORT}`);
    logger.info(`📖 Documentação: http://${env.HOST}:${env.PORT}/docs`);
  } catch (err) {
    logger.fatal({ err }, 'Falha ao iniciar o servidor');
    process.exit(1);
  }
}

void start();
