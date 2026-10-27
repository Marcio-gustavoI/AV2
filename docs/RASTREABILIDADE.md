# RASTREABILIDADE DE REQUISITOS — greencode

> Formato: ID | Requisito (resumo) | Status | Arquivo(s) | Teste(s)
>
> Legenda de Status: MANTIDO | ADAPTADO | SUBSTITUÍDO
>
> ⚠️ Colunas "Arquivo(s)" e "Teste(s)" serão preenchidas à medida que cada fase é implementada.

---

## 2.1 — Requisitos herdados da AV1

| ID | Requisito (resumo) | Status | Arquivo(s) | Teste(s) |
|----|--------------------|--------|-----------|---------|
| A1-01 | 4 papéis com segregação de responsabilidades | ADAPTADO | `src/domain/enums.ts`, `src/plugins/auth.ts`, cada service de módulo | `tests/integration/seguranca/auth-usuarios-parametros.test.ts` |
| A1-02 | Admin gerencia contas e parâmetros globais | MANTIDO | `src/modules/usuario/`, `src/modules/parametro/` | `tests/unit/seguranca/usuario-auth-parametro.service.test.ts`, `tests/integration/seguranca/auth-usuarios-parametros.test.ts` |
| A1-03 | Operador insere organizações e contratos | MANTIDO | `src/modules/organizacao/`, `src/modules/contrato/` | `tests/unit/organizacao/organizacao-contrato.service.test.ts`, `tests/integration/organizacao/organizacao-contrato.test.ts` |
| A1-04 | Gestor gerencia chegada de lotes, triagem, códigos de barras | MANTIDO | `src/modules/lote/`, `src/modules/equipamento/` | `tests/integration/lote/*.test.ts`, `tests/integration/equipamento/*.test.ts` |
| A1-05 | Auditor somente consulta e relatórios, sem alteração | MANTIDO | hook `exigirPapel`, todos os services | `tests/integration/seguranca/auth-usuarios-parametros.test.ts` |
| A1-06 | Senhas com hash SHA-256 | SUBSTITUÍDO | `src/modules/usuario/usuario.service.ts` (bcryptjs) | `tests/unit/seguranca/usuario-auth-parametro.service.test.ts`, `tests/integration/seguranca/auth-usuarios-parametros.test.ts` |
| A1-07 | Sessão expira após 30 min de inatividade | ADAPTADO | `src/plugins/auth.ts`, `src/modules/auth/auth.service.ts` | `tests/integration/seguranca/auth-usuarios-parametros.test.ts` |
| A1-08 | Modelagem OO com herança, interfaces, polimorfismo, fábricas | MANTIDO | `src/domain/` (validadores, fábricas, regras de transição) | `tests/unit/domain/*.test.ts` |
| A1-09 | Provisionamento inicial do primeiro admin | ADAPTADO | `scripts/criar-admin.ts` | `tests/integration/seguranca/auth-usuarios-parametros.test.ts` |
| A1-10 | Arquivos criptografados AES-256 | SUBSTITUÍDO | N/A (dados no PostgreSQL) | N/A — justificado em DECISOES.md |
| A1-11 | Escrita atômica (temp + rename) | ADAPTADO | todos os services que alteram estado (`$transaction`) | `tests/integration/*/transacao.test.ts` |
| A1-12 | CNPJ com dígitos verificadores e único | MANTIDO | `src/domain/validators/validador-cnpj.ts`, `src/modules/organizacao/organizacao.service.ts` | `tests/unit/domain/validador-cnpj.test.ts`, `tests/unit/organizacao/organizacao-contrato.service.test.ts`, `tests/integration/organizacao/organizacao-contrato.test.ts` |
| A1-13 | Lote: dataEntrada não futura nem anterior a 90 dias | MANTIDO | `src/domain/validators/validador-lote.ts`, `src/modules/lote/lote.service.ts` | `tests/unit/domain/validador-lote.test.ts` (borda: hoje, ontem, amanhã, 90d, 91d) |
| A1-14 | Desmonte só após triagem completa | MANTIDO | `src/domain/regras/regra-desmonte.ts`, `src/modules/equipamento/equipamento.service.ts` | `tests/unit/domain/regra-desmonte.test.ts`, `tests/integration/equipamento/desmonte.test.ts` |
| A1-15 | Justificativa obrigatória se estado físico cair 2 categorias | MANTIDO | `src/domain/validators/validador-movimentacao.ts`, `src/modules/movimentacao/movimentacao.service.ts` | `tests/unit/domain/validador-movimentacao.test.ts` |
| A1-16 | Journal retido por mínimo 180 dias | ADAPTADO | tabela `Auditoria`, `scripts/limpar-auditoria.ts` | `tests/integration/auditoria/retencao.test.ts` |
| A1-17 | Rotação do journal ao passar de 10 MB | ADAPTADO | `src/lib/logger.ts` (pino-roll com size=10MB) | `tests/integration/logger/rotacao.test.ts` |
| A1-18 | Interface CLI com readline, autocompletar, histórico | SUBSTITUÍDO | N/A (API REST + Swagger) | N/A — justificado em DECISOES.md |
| A1-19 | Menu se adapta ao papel do usuário | ADAPTADO | `src/modules/auth/auth.controller.ts` (`GET /auth/me`) | `tests/integration/seguranca/auth-usuarios-parametros.test.ts` |
| A1-20 | Comandos com ação principal + parâmetros | ADAPTADO | Tabela em `docs/ARQUITETURA.md` | N/A — documentação |
| A1-21 | Feedback com mensagens categorizadas por severidade | ADAPTADO | `src/plugins/error-handler.ts`, formato de erro com campo `severidade` | `tests/integration/*/erros.test.ts` |
| A1-22 | Scripts que simulam jornada completa | MANTIDO | `scripts/jornada.ts` | Execução do script (saída ✔/✘) |
| A1-23 | Documentar arquitetura de segurança e cenários de falha | MANTIDO | `docs/SEGURANCA.md` | N/A — documentação |
| A1-24 | Cada transação registrada em log imutável antes de aplicada | ADAPTADO | tabela `Auditoria`, trigger no banco, services com `$transaction` | `tests/integration/auditoria/imutabilidade.test.ts` |
| A1-25 | Windows 10+ e Ubuntu 24.04+ | MANTIDO | `docker-compose.yml`, `package.json` (scripts portáveis), `.gitattributes` | Verificação manual + CI |

---

## 2.2 — Requisitos da AV2

| ID | Requisito | Arquivo(s) | Teste(s) |
|----|-----------|-----------|---------|
| A2-01 | Monólito Node.js + TypeScript expondo API RESTful | `src/server.ts`, `src/app.ts`, estrutura `src/modules/` | Todos os testes de integração |
| A2-02 | Camadas Controller → Service → Repository independentes | `src/modules/<mod>/{controller,service,repository}.ts` | `tests/unit/` (services com repo em memória) |
| A2-03 | Fastify, rotas declarativas, JSON Schema, hooks, plugins | `src/app.ts`, `src/plugins/`, cada módulo `*.controller.ts` e `*.schemas.ts` | Todos os testes de integração |
| A2-04 | Porta configurável por variável de ambiente | `src/config/env.ts`, `src/server.ts` | `tests/integration/servidor/config.test.ts` |
| A2-05 | Graceful shutdown | `src/server.ts` | `tests/integration/servidor/shutdown.test.ts` |
| A2-06 | schema.prisma com todos os modelos e relacionamentos | `prisma/schema.prisma` | `tests/integration/*/crud.test.ts` |
| A2-07 | Migrações versionadas do Prisma | `prisma/migrations/` | `npm run test:db:preparar` |
| A2-08 | PostgreSQL | `docker-compose.yml`, `prisma/schema.prisma` | Todos os testes de integração |
| A2-09 | Unicidade de CNPJ e codigoBarrasInterno no banco | `prisma/schema.prisma` (@@unique), migração SQL (UNIQUE) | `tests/integration/organizacao/organizacao-contrato.test.ts`, `tests/integration/equipamento/codigo-barras.test.ts` |
| A2-10 | Constraints e/ou triggers contra estados inconsistentes | Migração SQL manual (`prisma/migrations/*/migration.sql`) | `tests/integration/banco/constraints.test.ts` |
| A2-11 | include/select intencional (eager loading) | Todos os `*.repository.ts` | Documentado em ARQUITETURA.md + testes de integração |
| A2-12 | bcrypt, JWT {id, papel}, hook global, services validam papel | `src/modules/auth/`, `src/plugins/auth.ts` | `tests/unit/seguranca/usuario-auth-parametro.service.test.ts`, `tests/integration/seguranca/auth-usuarios-parametros.test.ts` |
| A2-13 | $transaction em criação de lote e atualização de status | `src/modules/lote/lote.service.ts`, `src/modules/movimentacao/movimentacao.service.ts` | `tests/integration/*/transacao.test.ts` |
| A2-14 | Versionamento otimista (campo versao verificado em updates) | Todos os services que fazem update | `tests/integration/*/versao.test.ts`, `tests/integration/*/concorrencia.test.ts` |
| A2-15 | Seed com massa representativa | `prisma/seed.ts` | `tests/integration/seed/idempotencia.test.ts` |
| A2-16 | API documentada com OpenAPI/Swagger | `src/plugins/swagger.ts` | Rota `/docs` acessível |
| A2-17 | Decisões arquiteturais justificadas | `docs/DECISOES.md` | N/A — documentação |
| A2-18 | Reflexão sobre limites do monólito | `docs/DECISOES.md` (seção "Limites do monólito") | N/A — documentação |
| A2-19 | Compatível com Windows 10+ e Ubuntu 24.04+ | `package.json`, `docker-compose.yml`, `.gitattributes` | CI + verificação manual |
| A2-20 | Pronto para front-end SPA (CORS configurável) | `src/plugins/cors.ts`, `src/config/env.ts` | `tests/integration/servidor/cors.test.ts` |
