# PROGRESSO DO PROJETO GREENCODE

> Estado REAL, verificado por comandos. Última atualização: 2026-10-26.

## Fase atual: FASE 2 concluída, aguardando "APROVADO" (PARADA 2)

### Fase 0: aprovada (commit 3b01dff)

### Fase 1: verificada (commit c02da3a)
- `npm run typecheck` e `npm run lint` com exit 0; `npm test` com 2 testes passando
- NÃO demonstrado: graceful shutdown (PENDENCIAS P10)

### Fase 2: verificada (revisada após feedback)
- Schema: `senha_hash`, `@db.Uuid` em PKs/FKs, `Auditoria.antes/depois` opcionais, `onDelete: Restrict` explícito em todas as relações, `Equipamento.status @default(RECEBIDO)`, índice em `movimentacoes.usuario_id`; `prisma format` e `validate` ok
- Migração 1 regenerada com `prisma migrate diff`; migração 2 reescrita (CHECKs de CNPJ, lote com tolerância de 1 dia, R3, R4, trigger de imutabilidade de movimentacoes)
- `prisma migrate reset --force --skip-seed`: 2 migrações aplicadas em banco vazio
- Verificado com saída real (19 erros esperados + controles positivos): CHECKs antigos e novos, triggers de Auditoria e Movimentacao, INSERT de Auditoria com `antes` nulo, status padrão RECEBIDO
- Bug do trigger (NULL <> 'on') documentado em DECISOES D-17; decisões D-16 e D-18 adicionadas
- typecheck, lint e testes continuam verdes
## Ambiente
Os containers `greencode_db` (5432) e `greencode_db_test` (5433) foram subidos manualmente. No sandbox, `localhost:5432` e o pipe do Docker podem ficar inacessíveis; os comandos de banco rodaram fora do sandbox.

## Próximo passo
Após "APROVADO": Fase 3 (domínio: enums, erros, validadores, fábricas, regras de transição, Relogio) com testes unitários.


## Fase 2 aprovada pelo usuário (2026-10-26). Pendências futuras registradas
- Fase 4: helper `limparBanco` com `SET LOCAL session_replication_role = replica` (PENDENCIAS P13)
- Fase 6: migração 3 com trigger de `codigo_barras_interno` imutável (PENDENCIAS P14)
- Fase 10: teste do trigger da Auditoria com a variável nunca definida (PENDENCIAS P12)
- Em andamento: Fases 3, 4 e 5 em sequência; parar ao fim da Fase 5.
- Ambiente: comandos que acessam o Postgres (`localhost:5432/5433`) e o Docker rodam fora do sandbox (aprovado pelo usuário).
- Dica Windows PowerShell 5: não existe `&&`; usar `npm run verificar` (typecheck + lint + test).

### Fase 3 – Domínio: ✅ concluída e validada
- `src/domain/`: enums, erros, relogio (unificado com `src/lib/relogio.ts`), `Validador<T>` (Template Method), `ValidadorCnpj`, `ValidadorLote`, `ValidadorMovimentacao`, `RegraTransicao` (polimórfica), `LoteFactory`, `MovimentacaoFactory`.
- `tests/unit/domain/`: 20 testes unitários cobrindo R1–R6, R10 e bordas de data no fuso `America/Sao_Paulo`.
- `npm run typecheck`, `npm run lint` e `npm test` (4 arquivos, 22 testes) passando.


### Fase 4 – Organização e Contrato (R1): ✅ concluída e validada
- Repositórios (interface + memória + Prisma): `src/modules/organizacao/organizacao.repository.ts`, `src/modules/contrato/contrato.repository.ts`, `src/modules/auditoria/auditoria.repository.ts`.
- Services desacoplados de Fastify/Prisma: `src/modules/organizacao/organizacao.service.ts`, `src/modules/contrato/contrato.service.ts` (validação R1, unicidade CNPJ/código, versionamento otimista, auditoria transacional, RBAC).
- Rotas e JSON Schema (TypeBox): `POST|GET /api/v1/organizacoes`, `GET|PATCH /api/v1/organizacoes/:id`, `POST|GET|PATCH /api/v1/organizacoes/:id/contrato`.
- Helper de limpeza do banco de teste (`tests/helpers/banco.ts` com `SET LOCAL session_replication_role = 'replica'`) e script `scripts/preparar-banco-teste.ts`.
- Testes: `tests/unit/organizacao/organizacao-contrato.service.test.ts` (10 testes) e `tests/integration/organizacao/organizacao-contrato.test.ts` (5 testes) — total 6 arquivos, 37 testes passando.


### Fase 5 – Segurança (A1-01, A1-02, A1-05, A1-06, A1-07, A1-09, A1-19, A2-12, R12): ✅ concluída e validada
- Módulos `usuario`, `auth` e `parametro`: repositórios (interface + memória + Prisma), services desacoplados, schemas TypeBox e controllers.
- `AuthService`: comparação constante contra hash fictício quando o e-mail não existe, erro 401 idêntico para e-mail inexistente e senha incorreta, bloqueio de usuários inativos.
- `@fastify/jwt` real no hook global `src/plugins/auth.ts` (substituindo o cabeçalho temporário da Fase 4), `@fastify/rate-limit` (5 tentativas/minuto por IP em `POST /api/v1/auth/login`), redação de `senha`, `senhaHash`, `token` e `authorization` no Pino (`src/lib/logger.ts`).
- `scripts/criar-admin.ts`: provisionamento inicial via env ou terminal interativo, sem senha padrão.
- Testes: `tests/unit/seguranca/usuario-auth-parametro.service.test.ts` (5 testes) e `tests/integration/seguranca/auth-usuarios-parametros.test.ts` (7 testes) — total 8 arquivos, 49 testes passando.


### Fase 6 – Núcleo Logístico (A1-04, A1-11, A1-13, A1-14, A1-15, A1-24, A2-09, A2-13, A2-14, R2–R7, R9–R11): ✅ concluída e validada
- Migração 3 (`prisma/migrations/20261022000002_codigo_barras_imutavel/migration.sql`): trigger `trg_equipamentos_codigo_barras_imutavel` bloqueando UPDATE de `codigo_barras_interno` na tabela `equipamentos` (R6). Aplicada em `greencode` e `greencode_test`.
- Módulos `lote`, `equipamento` e `movimentacao`: repositórios (interface + memória + Prisma com `select`/`include` intencionais e sequence `seq_codigo_barras`), services desacoplados usando `LoteFactory`, `MovimentacaoFactory` e `Relogio`, schemas TypeBox e controllers (`/api/v1/lotes`, `/api/v1/equipamentos`, `/api/v1/equipamentos/:id/triagem`, `/api/v1/equipamentos/:id/movimentacoes`).
- Testes obrigatórios de concorrência e atomicidade (seção 11): (a) dois updates concorrentes com `Promise.all` -> um 200 e um 409; (b) falha injetada no meio da `$transaction` revertendo equipamento, movimentação e lote no banco; (c) lote com 1 equipamento inválido revertendo todo o lote.
- Testes: `tests/unit/logistica/lote-equipamento-movimentacao.service.test.ts` (4 testes) e `tests/integration/logistica/nucleo-logistico.test.ts` (7 testes) — total 10 arquivos, 60 testes passando.
