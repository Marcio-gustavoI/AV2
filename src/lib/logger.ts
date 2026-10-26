import path from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.join(__dirname, '..', '..', 'logs');

const logFile = path.join(logsDir, 'greencode.log');

// pino-roll: rotação ao atingir o tamanho configurado
// Verificado: pino-roll suporta o parâmetro `size` (ex: "10m")
const transport = pino.transport({
  targets: [
    {
      target: 'pino/file',
      options: { destination: 1 }, // stdout
      level: process.env['LOG_LEVEL'] ?? 'info',
    },
    {
      target: 'pino-roll',
      options: {
        file: logFile,
        size: process.env['LOG_MAX_SIZE'] ?? '10m',
        mkdir: true,
      },
      level: process.env['LOG_LEVEL'] ?? 'info',
    },
  ],
});

export const logger = pino(
  {
    level: process.env['LOG_LEVEL'] ?? 'info',
    // Nunca logar campos sensíveis
    redact: {
      paths: [
        'req.headers.authorization',
        'body.senha',
        'body.senhaAtual',
        'body.novaSenha',
        '*.senhaHash',
      ],
      censor: '[REDACTED]',
    },
    serializers: {
      req: (req: { method: string; url: string; id: string }) => ({
        id: req.id,
        method: req.method,
        url: req.url,
      }),
      res: (res: { statusCode: number }) => ({
        statusCode: res.statusCode,
      }),
    },
  },
  transport,
);
