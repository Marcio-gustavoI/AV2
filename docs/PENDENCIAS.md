# PENDÊNCIAS DO PROJETO GREENCODE

> Itens a confirmar com o professor, limitações reais do ambiente e histórico de itens resolvidos.

---

## 1. Itens a Confirmar com o Professor (Suposições da Especificação)

### P1 — CNPJ alfanumérico (pesquisa CONFIRMADA; confirmar expectativa da correção)
- **Contexto:** O CNPJ alfanumérico entrou em vigor em 2026 (IN RFB nº 2.229/2024). A especificação (R1) exigiu pesquisa antes de aceitar letras.
- **Estado atual:** Confirmado por pesquisa oficial (SERPRO/RFB: Módulo 11 com `ASCII - 48`). O `ValidadorCnpj` e o `CHECK` do banco aceitam CNPJs numéricos tradicionais e alfanuméricos (`^[A-Z0-9]{12}[0-9]{2}$`). Ver `docs/DECISOES.md` (D-10).
- **Ação com o professor:** Confirmar se a bateria de avaliação usará CNPJs alfanuméricos além dos numéricos (o algoritmo implementado cobre ambos).

### P2 — Contrato opcional para criar lote (`C6`)
- **Contexto:** A AV2 define que a organização possui contrato opcional (`0..1`).
- **Estado atual:** `LoteService.criar` exige organização existente (`R11`), mas **não** exige que a organização possua contrato vigente para receber lotes (`D-C6`).
- **Ação com o professor:** Confirmar se lotes de coleta avulsos/experimentais sem contrato seguem o esperado na avaliação.

### P5 — Fórmula financeira (`R8`)
- **Contexto:** Implementada a fórmula exata da especificação: `valorResidual = valorAquisicao × (1 − coeficienteDepreciacao(tipo))` e `imposto = valorResidual × aliquota`, com `Decimal` e arredondamento `ROUND_HALF_UP` a 2 casas decimais. Equipamentos sem `valorAquisicao` são contabilizados separadamente em `equipamentosSemValorAquisicao`.
- **Ação com o professor:** Confirmar se a fórmula e o arredondamento a cada etapa atendem integralmente ao gabarito.

### P6 — Nomes de classes, enums e campos sem o diagrama UML original da AV1 (`C5`)
- **Contexto:** O diagrama UML da AV1 não foi anexado ao enunciado.
- **Estado atual:** Todos os nomes de classes (`Validador<T>`, `ValidadorCnpj`, `ValidadorLote`, `ValidadorMovimentacao`, `LoteFactory`, `MovimentacaoFactory`, `RegraTransicao`), enums e campos seguiram literalmente o prompt mestre e estão diagramados em `docs/ARQUITETURA.md`.

### P7 — Campo `versao` em modelos append-only (`C8`)
- **Estado atual:** `Movimentacao` possui `versao = 1` (constante) e trigger bloqueando `UPDATE`/`DELETE`; `Auditoria` não possui coluna `versao` por ser puramente append-only e protegida por trigger (`D-C8` e `D-14`).

---

## 2. Limitações Reais de Ambiente e Riscos Residuais Conhecidos

### P4 — Sinal POSIX `SIGTERM` no Windows
- **Contexto:** No Windows, `child.kill('SIGTERM')` no Node.js chama `TerminateProcess()` da Win32 API, encerrando o processo abruptamente sem invocar handlers JavaScript.
- **Estado atual:** O graceful shutdown foi provado em teste automatizado no Windows via `SIGINT` (processo filho saindo com código `0` e fechando conexões). O teste nativo de `SIGTERM` está presente em `tests/integration/acabamento/acabamento-fase8.test.ts` com `it.skipIf(process.platform === 'win32')` e executa no job Linux do CI (`.github/workflows/ci.yml`).

### P8 — Execução em Ubuntu 24.04 LTS
- **Contexto:** O desenvolvimento e todas as execuções reais de banco, migrações, seed, testes, cobertura e jornada foram realizados em **Windows 10/11**.
- **Estado atual:** A compatibilidade com Ubuntu 24.04 foi preparada por meio de scripts npm 100% portáveis, caminhos com `path.join`/`path.resolve`, `bcryptjs` puro em JS, `.gitattributes` (`eol=lf`), `docker-compose.yml` e workflow `.github/workflows/ci.yml` com `ubuntu-24.04`, mas o ambiente Ubuntu não foi executado localmente nesta máquina Windows.

### P9 — Vulnerabilidade transitiva `deepmerge-ts` na CLI do Prisma 6
- **Contexto:** `npm audit` aponta vulnerabilidade na dependência transitiva `@prisma/config -> deepmerge-ts` da CLI `prisma` (pacote de desenvolvimento). Atualizar forçadamente exigiria migrar para Prisma 7 (mudança incompatível de arquitetura de configuração).
- **Estado atual:** Mantido Prisma `6.19.3`; o pacote vulnerável não faz parte do runtime de produção (`@prisma/client`). Documentado em `docs/SEGURANCA.md`.

---

## 3. Histórico de Pendências Concluídas

| ID | Descrição | Resolução |
|---|---|---|
| P3 | `psql` ausente no PATH do Windows | Resolvido via `docker compose` e `PrismaClient` / `docker exec` |
| P10 | Teste automatizado de graceful shutdown | Implementado e validado em `tests/integration/acabamento/acabamento-fase8.test.ts` |
| P11 | Rota `/docs` do Swagger | Implementada em `src/plugins/swagger.ts` e validada em `/docs` e `/docs/json` |
| P12 | Teste automatizado do trigger da Auditoria com variável `greencode.limpeza` nunca definida | Implementado e validado em `tests/integration/acabamento/acabamento-fase8.test.ts` |
| P13 | Limpeza dos testes de integração respeitando os triggers | Implementado em `tests/helpers/banco.ts` com `SET LOCAL session_replication_role = replica` restrito ao banco `_test` |
| P14 | Terceira migração com trigger de imutabilidade de `codigo_barras_interno` (`R6`) | Implementada em `prisma/migrations/20261022000002_codigo_barras_imutavel/migration.sql` e testada em `tests/integration/logistica/nucleo-logistico.test.ts` |
