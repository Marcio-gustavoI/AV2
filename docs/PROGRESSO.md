# PROGRESSO DO PROJETO GREENCODE

> Estado REAL, verificado por comandos. Última atualização: 2026-10-26.

## Fase atual: FASE 2 concluída, aguardando "APROVADO" (PARADA 2)

### Fase 0: aprovada (commit 3b01dff)

### Fase 1: verificada (commit c02da3a)
- `npm run typecheck` e `npm run lint` com exit 0; `npm test` com 2 testes passando
- NÃO demonstrado: graceful shutdown (PENDENCIAS P10)

### Fase 2: verificada
- `prisma validate`: schema válido
- `prisma migrate deploy` em banco vazio: 2 migrações aplicadas; `migrate status`: "Database schema is up to date!"
- Trigger de Auditoria (saída real): UPDATE bloqueado; DELETE sem variável bloqueado; DELETE com `SET LOCAL greencode.limpeza='on'` de registro com 179 dias bloqueado; de 181 dias permitido; TRUNCATE bloqueado
- CHECKs (erro real de cada um): parametros.valor < 0; contratos.fim < inicio; triagem_completa sem classificacao_destino; valor_aquisicao < 0; lote com data futura
- Trigger de Movimentacao: sem mudança bloqueada; só mudança de estado físico aceita
- Sequence `seq_codigo_barras` funcionando (nextval = 1)

### Bug encontrado e corrigido na Fase 2
O trigger da Auditoria deixava o DELETE passar quando a variável `greencode.limpeza` nunca tinha sido definida (`current_setting(..., true)` devolve NULL e `NULL <> 'on'` é NULL). Corrigido com `COALESCE(..., '')` na migração 2 e reaplicado em banco recriado.

### Observação
O CHECK `data_entrada <= CURRENT_DATE` usa a data do banco (UTC). Entre 21h e 24h em America/Sao_Paulo, o banco já vê o dia seguinte. A regra exata (R2, fuso `TZ_NEGOCIO`) fica no service.

## Ambiente
Os containers `greencode_db` (5432) e `greencode_db_test` (5433) foram subidos manualmente. No sandbox, `localhost:5432` e o pipe do Docker podem ficar inacessíveis; os comandos de banco rodaram fora do sandbox.

## Próximo passo
Após "APROVADO": Fase 3 (domínio: enums, erros, validadores, fábricas, regras de transição, Relogio) com testes unitários.
