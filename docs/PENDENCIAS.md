# PENDÊNCIAS DO PROJETO GREENCODE

> Itens a confirmar com o professor, limitações reais, e decisões tomadas sob incerteza.

---

## P1 — CNPJ alfanumérico (pesquisa CONFIRMADA; confirmar só a expectativa com o professor)

**Contexto:** O CNPJ alfanumérico entrou em vigor em 2026 (IN RFB nº 2.229/2024). A especificação (R1) exige pesquisa antes de aceitar letras.

**Pesquisa:** confirmada na Fase 0 (SERPRO/gov.br): Módulo 11 com valor = código ASCII − 48; 12 primeiras posições aceitam A–Z e 0–9; os 2 dígitos verificadores são numéricos. Ver **DECISOES.md D-10**.

**Decisão adotada:** `ValidadorCnpj` aceita letras e dígitos. Normalização remove pontuação e coloca em maiúsculas; formato `/^[A-Z0-9]{12}\d{2}$/`.

**Ação necessária:** professor confirmar se a avaliação espera CNPJ alfanumérico ou apenas numérico (o mesmo algoritmo cobre ambos).

---

## P2 — Contrato opcional para criar lote (CONFIRMAR COM O PROFESSOR)

**Contexto:** a AV2 diz que o contrato é opcional. Decisão C6: não exigir contrato vigente para criar lote.

**Ação necessária:** professor confirmar.

---

## P3 — `psql` não está no PATH do Windows

**Decisão:** PostgreSQL via Docker Compose; comandos SQL manuais via `docker exec ... psql`. Impacto nulo.

---

## P4 — Teste de SIGTERM no Windows

**Decisão:** teste de shutdown com SIGTERM usa `skipIf(process.platform === 'win32')`, com justificativa no código; roda no CI Linux.

---

## P5 — Fórmula financeira R8 (CONFIRMAR COM O PROFESSOR)

`valorResidual = valorAquisicao × (1 − coeficiente(tipo))`, `imposto = valorResidual × alíquota`, arredondamento a 2 casas (ROUND_HALF_UP). Registrada como suposição.

---

## P6 — UML da AV1 não fornecido (C5)

Nomes de classes/enums/campos são suposições baseadas na especificação. UML do implementado irá em `docs/ARQUITETURA.md`.

---

## P7 — `versao` em Auditoria (C8)

`Auditoria` não tem `versao`; `Movimentacao` tem `versao = 1`.

---

## P8 — Verificação por sistema operacional

- Windows 10/11: ambiente de desenvolvimento (verificações registradas em DECISOES.md D-15 e PROGRESSO.md).
- Ubuntu 24.04: somente via CI (Fase 10), ainda não executado.

---

## P9 — Vulnerabilidade `deepmerge-ts` (transitiva do Prisma 6)

**Contexto:** `npm audit` reporta 3 vulnerabilidades `high` na cadeia `prisma → @prisma/config → deepmerge-ts < 8.0.0` (esgotamento de pilha ao mesclar objetos recursivos).

**Decisão:** manter Prisma 6.19.3. `npm audit fix --force` migraria para Prisma 7 (config e adapter diferentes), o que reescreveria a Fase 2. Afeta a CLI de desenvolvimento, não o fluxo de dados da API.

**Ação necessária:** professor confirmar que manter Prisma 6 é aceitável. Registrar como risco residual em SEGURANCA.md.

---

## P10 — Graceful shutdown ainda não demonstrado no Windows

**Contexto:** no Windows, matar um processo filho de fora não aciona o handler de `SIGINT`. Na Fase 1 foram verificados apenas boot, `/saude` e 404 padronizado.

**Alternativa:** teste automatizado com processo filho na Fase 10 (SIGTERM pulado no Windows, executado no CI Linux). **Ainda não executado.**

---

## P11 — Mensagem de boot cita `/docs` antes de o Swagger existir

`src/server.ts` loga a URL `/docs`, mas o Swagger só será registrado na Fase 8. Corrigir/validar então.

---

## Histórico de pendências resolvidas

| ID | Descrição | Resolução |
|----|-----------|-----------|
| P10 (antigo) | Timeouts de permissão do terminal na sessão anterior | Obsoleto: os comandos agora rodam normalmente |
| Lint/typecheck | `tsconfig.test.json` herdava `exclude` de `tests/`, então testes não eram checados | Corrigido na retomada (exclude sobrescrito) |

---

## P12 — Fase 10: teste do trigger da Auditoria com a variável NUNCA definida

O bug D-17 (`NULL <> 'on'`) só aparece quando a variável `greencode.limpeza` nunca foi definida na sessão. O teste automatizado deve cobrir os três estados: nunca definida, `off` e `on`. **Pendente (Fase 10).**

## P13 — Limpeza dos testes de integração (definido na Fase 4)

O trigger da Auditoria bloqueia DELETE de registros com menos de 180 dias e TRUNCATE. **Decisão:** helper de teste `limparBanco` que, em uma transação, executa `SET LOCAL session_replication_role = replica` (desabilita os triggers comuns, exige superusuário; o usuário do container Docker é superusuário) e depois `TRUNCATE` das tabelas e `ALTER SEQUENCE seq_codigo_barras RESTART`. O helper recusa rodar se `DATABASE_URL` não contiver `_test`. Alternativa descartada: recriar o schema a cada teste (lento).

## P14 — Fase 6: terceira migração (código de barras imutável)

Criar a migração 3 com trigger que bloqueia UPDATE de `equipamentos.codigo_barras_interno` (R6: imutável), com teste. **Pendente (Fase 6).**
