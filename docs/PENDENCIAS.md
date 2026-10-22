# PENDÊNCIAS DO PROJETO GREENCODE

> Itens a confirmar com o professor, limitações reais, e decisões tomadas sob incerteza.

---

## P1 — CNPJ Alfanumérico (CONFIRMAR COM PROFESSOR)

**Contexto:** A data atual é 2026-10-21. O CNPJ alfanumérico entrou em vigor no Brasil em 2026. A especificação (R1) menciona: "Sobre CNPJ alfanumérico (vigente no Brasil a partir de 2026): verifique a regra oficial da Receita Federal por pesquisa; se confirmar que o cálculo é o mesmo com valor = código ASCII − 48, aceite letras e dígitos; se não conseguir confirmar, aceite apenas numérico e registre em DECISOES.md."

**Decisão adotada:** Será feita pesquisa na Receita Federal/IN RFB. Se confirmado o algoritmo compatível (valor = ASCII − 48), o validador aceitará alfanumérico. Caso contrário, aceitar apenas numérico por ora.

**Ação necessária:** Professor confirmar expectativa de validação do CNPJ alfanumérico.

---

## P2 — Contrato opcional para criar lote (CONFIRMAR COM PROFESSOR)

**Contexto:** A AV2 diz que a organização tem contrato opcional. A decisão C6 adota: não exigir contrato vigente para criar lote.

**Decisão adotada:** Criar lote não exige contrato vigente. O contrato é um relacionamento independente da organização.

**Ação necessária:** Professor confirmar se a criação de lote deveria exigir contrato vigente.

---

## P3 — psql não disponível no PATH do Windows

**Contexto:** `psql` não está instalado no PATH do ambiente de desenvolvimento Windows. Docker está disponível.

**Decisão adotada:** PostgreSQL será provisionado exclusivamente via Docker Compose. Comandos de banco usarão `docker exec` quando necessário via o CLI do Prisma.

**Impacto:** Nenhum — Docker Compose com PostgreSQL é a abordagem primária documentada na especificação.

---

## P4 — Testes de SIGTERM no Windows

**Contexto:** A especificação (seção 13) menciona: "Se o teste de SIGTERM não for confiável no Windows, marque como pulado nesse SO com justificativa (e não oculte)."

**Decisão adotada:** O teste de graceful shutdown com SIGTERM será marcado com `test.skipIf(process.platform === 'win32')` no Windows, com comentário explicativo. O teste roda normalmente no CI (Ubuntu).

---

## P5 — Fórmula de cálculo financeiro (CONFIRMAR COM PROFESSOR)

**Contexto:** A especificação (R8) descreve: `valorResidual = valorAquisicao × (1 − coeficienteDepreciação(tipo))` e `imposto = valorResidual × alíquota`. A especificação instrui registrar como "suposição" em DECISOES.md.

**Decisão adotada:** Implementar exatamente a fórmula descrita. Arredondamento a 2 casas usando ROUND da aritmética Decimal.

**Ação necessária:** Professor confirmar fórmula e regra de arredondamento.

---

## P6 — Diagrama UML não fornecido (suposição C5)

**Contexto:** O diagrama UML da AV1 não foi fornecido. Os nomes de classes, enums e campos são baseados na especificação do prompt.

**Decisão adotada:** Nomear conforme descrito na especificação. Produzir o UML Mermaid do que foi realmente implementado em docs/ARQUITETURA.md.

---

## P7 — Campo `versao` em Auditoria (decisão C8)

**Contexto:** A especificação (C8) diz que `Auditoria` não recebe `versao`, com justificativa em DECISOES.md. `Movimentacao` recebe `versao = 1` por conformidade literal com A2-14.

**Decisão adotada:** `Auditoria` não tem campo `versao`. `Movimentacao` tem `versao = 1` (constante, pois é append-only).

---

## P8 — Verificação em múltiplos SOs

**Contexto:** A especificação pede registro de quais verificações foram executadas em cada SO.

**Status:**
- Windows 10/11: ambiente de desenvolvimento ativo (versões verificadas em 2026-10-21)
- Ubuntu 24.04: via CI (GitHub Actions) — verificações de CI serão registradas quando o CI for configurado

---

## P9 — Limite de 3 tentativas para correção de falhas

**Contexto:** O protocolo (seção 0.5) instrui: "se travar após 3 tentativas na mesma falha, registre em PENDENCIAS.md e explique".

**Status:** Nenhuma falha persistente registrada até a Fase 0.

---

## Histórico de pendências resolvidas

| ID | Descrição | Resolução |
|----|-----------|-----------|
| — | — | — |
