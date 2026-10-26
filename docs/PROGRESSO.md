# PROGRESSO DO PROJETO GREENCODE

> Estado REAL, verificado por comandos. Última atualização: 2026-10-26.

## Fase atual: FASE 2 – Banco (arquivos escritos, NADA executado ainda)

### Fase 0 – Planejamento: ✅ aprovada (commit 3b01dff)

### Fase 1 – Base: ✅ verificada
- `npm run typecheck` → exit 0 (agora inclui tests/, scripts/, prisma/)
- `npm run lint` (`eslint .`) → exit 0
- `npm test` → 1 arquivo, 2 testes passando (`/saude` 200 e 404 padronizado)
- Servidor sobe com `npx tsx src/server.ts`; `GET /saude` → 200; rota inexistente → erro padronizado
- NÃO demonstrado: graceful shutdown (ver PENDENCIAS P10)

### Fase 2 – Banco: ⏳ em andamento
- Escritos, mas **nunca executados**: `docker-compose.yml`, `prisma/schema.prisma`, 2 migrações SQL
- Falta: subir Postgres, `prisma migrate deploy` em banco vazio, testar triggers, `prisma.$disconnect()` no shutdown, commit, PARADA 2

## Comandos validados
```
node v22.14.0 | npm 10.9.2 | Prisma 6.19.3 | TypeScript 6.0.3 | Vitest 5.0.5 | Fastify 5.12.7 | ESLint 10.13.0
npm run typecheck ; npm run lint ; npm test
```

## Próximo passo exato
1. `docker compose up -d postgres postgres_test` e `docker compose ps`
2. `npx prisma migrate deploy` (banco vazio) e mostrar a saída
3. Testar trigger da Auditoria (UPDATE/DELETE) via `docker exec`
4. Commit `fase-2`, mostrar schema + SQL, aguardar "APROVADO"

## Fases futuras
Fases 3 a 11 pendentes (ver docs/ESPECIFICACAO.md seção 18).

## BLOQUEIO (2026-10-26)
Docker CLI existe, mas o daemon (pipe dockerDesktopLinuxEngine) nao esta disponivel; Docker Desktop iniciado via Start-Process nao ficou em execucao. psql ausente. Migracoes e triggers NAO foram executados. Retomar em: docker compose up -d postgres postgres_test.
