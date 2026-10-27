import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

/**
 * Configura documentação OpenAPI 3.0 e interface Swagger UI em `/docs` (A2-16).
 */
export async function registrarSwagger(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'greencode — API de Logística Reversa de Resíduos Eletrônicos',
        description:
          'API RESTful monolítica (Fastify + Prisma + PostgreSQL) para rastreabilidade ponta a ponta, triagem técnica, desmonte e auditoria imutável de resíduos eletrônicos.',
        version: '1.0.0',
      },
      tags: [
        { name: 'Sistema', description: 'Monitoramento e saúde do servidor' },
        { name: 'Autenticação', description: 'Login JWT, renovação de sessão e perfil por papel' },
        { name: 'Usuários', description: 'Gestão de contas de usuários (exclusivo ADMIN)' },
        { name: 'Parâmetros', description: 'Parâmetros financeiros e globais (exclusivo ADMIN)' },
        { name: 'Organizações', description: 'Cadastro de organizações parceiras e validação de CNPJ (R1)' },
        { name: 'Contratos', description: 'Contratos vinculados às organizações parceiras' },
        { name: 'Lotes', description: 'Recebimento de lotes e geração de etiquetas (R2, R6, R7)' },
        { name: 'Equipamentos', description: 'Equipamentos, triagem técnica (R9) e rastreabilidade' },
        { name: 'Movimentações', description: 'Transições de status e estado físico (R3, R4, R5, R10)' },
        { name: 'Relatórios', description: 'Resumo operacional e cálculo financeiro Decimal (R8)' },
        { name: 'Auditoria', description: 'Consulta ao journal imutável de auditoria (A1-16, A1-24)' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Informe o token JWT obtido em POST /api/v1/auth/login',
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
  });
}
