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
