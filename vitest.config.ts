import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Valores determinísticos para testes; dotenv não sobrescreve variáveis já definidas.
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      JWT_SECRET: 'segredo-somente-para-testes-com-mais-de-32-caracteres',
      DATABASE_URL: 'postgresql://greencode:greencode@localhost:5433/greencode_test',
    },
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/lib/prisma.ts'],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
      },
    },
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
