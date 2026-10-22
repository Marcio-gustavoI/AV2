# PROGRESSO DO PROJETO GREENCODE

## Fase Atual: FASE 0 – Planejamento

**Data de início:** 2026-10-21  
**Status:** 🔄 Em andamento

---

## O que está feito

- [x] Verificação de ambiente (Node v22.14.0, npm 10.9.2, Docker 29.5.3, git 2.49.0)
- [x] Criação da estrutura de diretórios (`greencode/`, `greencode/docs/`)
- [x] Salvamento de `docs/ESPECIFICACAO.md`
- [x] Criação de `docs/PROGRESSO.md` (este arquivo)
- [x] Criação de `docs/RASTREABILIDADE.md`
- [x] Criação de `docs/PENDENCIAS.md`

## O que falta (Fase 0)

- [ ] Apresentação do resumo para PARADA 1 e aguardar "APROVADO"

---

## Fases futuras

| Fase | Descrição | Status |
|------|-----------|--------|
| 0 | Planejamento | 🔄 Em andamento |
| 1 | Base (TS, lint, env, Fastify, /saude, shutdown) | ⏳ Aguardando |
| 2 | Banco (Prisma, schema, migrações, Docker) | ⏳ Aguardando |
| 3 | Domínio (enums, validadores, fábricas, regras) | ⏳ Aguardando |
| 4 | Organização/Contrato (repo + service + rotas + R1) | ⏳ Aguardando |
| 5 | Segurança (usuários, bcrypt, JWT, hooks, matriz papéis) | ⏳ Aguardando |
| 6 | Núcleo logístico (lotes, equipamentos, movimentações R2-R11) | ⏳ Aguardando |
| 7 | Auditoria e relatórios | ⏳ Aguardando |
| 8 | Acabamento técnico (Swagger, paginação, CORS, logs) | ⏳ Aguardando |
| 9 | Seed e jornada | ⏳ Aguardando |
| 10 | Testes e documentação final | ⏳ Aguardando |
| 11 | Auditoria final (adversarial) | ⏳ Aguardando |

---

## Comandos validados

```bash
# Verificação de ambiente (Fase 0)
node --version   # v22.14.0
npm --version    # 10.9.2
git --version    # 2.49.0.windows.1
docker --version # 29.5.3
docker compose version # v5.1.4
# psql: NÃO disponível no PATH (mas Docker está disponível - PostgreSQL via container)
```

---

## Riscos identificados (Fase 0)

| # | Risco | Probabilidade | Impacto | Mitigação |
|---|-------|--------------|---------|-----------|
| R1 | psql não no PATH | Alta (confirmado) | Baixo | Usar PostgreSQL via Docker Compose |
| R2 | Prisma v7+ com API diferente | Média | Alto | Verificar versão antes de configurar |
| R3 | pino-roll com API incompatível de versão | Média | Médio | Verificar doc antes de usar opção `size` |
| R4 | @fastify/type-provider-typebox vs versão Fastify | Média | Médio | Verificar compatibilidade antes de instalar |
| R5 | Testes de SIGTERM no Windows não confiáveis | Alta | Baixo | Marcar como skip no Windows com justificativa |
| R6 | CNPJ alfanumérico (vigência 2026) | Alta (data atual!) | Médio | Pesquisar Receita Federal; registrar em DECISOES.md |
| R7 | Vitest com configuração incompatível | Baixa | Médio | Verificar versão instalada |
| R8 | Scripts npm com sintaxe não portável | Média | Médio | Usar cross-env e rimraf; evitar sh/bash |

---

## Notas da Fase 0

- **psql não está no PATH do Windows**: PostgreSQL será provisionado exclusivamente via Docker Compose. Isso está alinhado com a especificação (seção 16 menciona Docker Compose como abordagem).
- **Data atual**: 2026-10-21. O CNPJ alfanumérico entrou em vigor no Brasil. É necessário pesquisar e decidir sobre suporte ao CNPJ alfanumérico (R1/DECISOES.md).
- **Windows como ambiente de desenvolvimento confirmado**: Algumas verificações de portabilidade serão executadas apenas no CI (Ubuntu).
