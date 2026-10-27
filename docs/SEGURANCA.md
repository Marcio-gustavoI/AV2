# ARQUITETURA DE SEGURANÇA — greencode

Este documento descreve os mecanismos de proteção de credenciais, autenticação JWT, controle de acesso baseado em papéis (RBAC), imutabilidade de auditoria, proteção contra força bruta, redação de logs, cenários de falha verificados por testes automatizados e riscos residuais.

---

## 1. Hash de Senhas e Política de Credenciais (`C1`, `A1-06`, `R12`)

- **Algoritmo:** `bcryptjs` (implementação em JavaScript puro do algoritmo Blowfish/bcrypt, garantindo portabilidade idêntica entre Windows 10/11 e Ubuntu 24.04 sem necessidade de compilador C++).
- **Custo (Salt Rounds):** configurável via variável de ambiente `BCRYPT_ROUNDS` (padrão `12` em produção/desenvolvimento). O salt aleatório de 128 bits é gerado automaticamente por senha e embutido no próprio hash.
- **Política de Complexidade (`R12`):** mínimo de 10 caracteres, exigindo obrigatoriamente pelo menos uma letra e um número.
- **Proteção contra Enumeração e Timing Attack:** no endpoint `POST /api/v1/auth/login`, quando o e-mail informado não existe ou pertence a usuário inativo, o `AuthService` executa `bcrypt.compare` contra um hash constante pré-calculado (`HASH_FICTICIO_TIMING`) e devolve exatamente a mesma mensagem e código (`401 NAO_AUTENTICADO: "Credenciais inválidas."`) de uma senha incorreta.
- **Supressão de `senhaHash`:** todas as projeções de resposta de `/api/v1/usuarios` omitem `senhaHash` tanto no `select` do repositório quanto no JSON Schema de saída.

---

## 2. Autenticação JWT, Sessão e Limitações (`C4`, `A1-07`, `A2-12`)

- **Emissão:** `POST /api/v1/auth/login` emite um token JWT assinado com `JWT_SECRET` (validado no boot para ter no mínimo 32 caracteres), contendo o payload `{ sub: usuario.id, papel: usuario.papel }`.
- **Expiração e Renovação:** o tempo de vida padrão é de 30 minutos (`JWT_EXPIRA_EM=30m`). O endpoint `POST /api/v1/auth/renovar` valida o token vigente, verifica no banco se o usuário continua ativo (`ativo = true`) e emite um novo token com o papel atualizado do banco.
- **Limitação Conhecida (Stateless JWT):** por não utilizar armazenamento de sessão em servidor (ex.: Redis), um token emitido permanece criptograficamente válido até atingir seu `exp` (até 30 minutos), mesmo que o usuário seja desativado nesse intervalo. A mitigação implementada bloqueia imediatamente novos logins e renovações (`POST /auth/renovar`).

---

## 3. Autorização RBAC em Duas Camadas (`A1-01` a `A1-05`, `D-13`)

A autorização é aplicada em **defesa em profundidade**:

1. **Camada HTTP (Hook Fastify):** o decorator `exigirPapel([...])` em `src/plugins/auth.ts` intercepta a requisição antes do controller e retorna `403 SEM_PERMISSAO` caso o papel do JWT não pertença ao conjunto autorizado.
2. **Camada de Negócio (Service):** todos os métodos de `Service` validam `ator.papel` antes de qualquer lógica ou acesso a repositório, garantindo que chamadas diretas ao Service (em testes ou futuros consumidores internos) mantenham a mesma segurança.

---

## 4. Auditoria Imutável e Política de Retenção (`A1-16`, `A1-24`, `D-07`, `D-17`)

- **Gravação Transacional:** todo `POST`, `PUT` ou `PATCH` que altera estado grava um registro na tabela `auditorias` **dentro da mesma `$transaction`** da operação de negócio. Se a gravação da auditoria falhar, toda a transação sofre rollback.
- **Proteção por Trigger no PostgreSQL:** a função `fn_proteger_auditoria` e os triggers `trg_proteger_auditoria_row` e `trg_proteger_auditoria_truncate` bloqueiam qualquer `UPDATE`, `TRUNCATE` e `DELETE` direto na tabela `auditorias`.
- **Exceção Controlada de Retenção (`npm run limpar-auditoria`):** o `DELETE` só é permitido pelo trigger quando:
  1. A variável de sessão `greencode.limpeza` foi definida como `'on'` na transação corrente (`SET LOCAL greencode.limpeza = 'on'`), tratada com `COALESCE(current_setting('greencode.limpeza', true), '')` para bloquear sessões onde a variável nunca foi definida; **e**
  2. O registro possui `criado_em < NOW() - INTERVAL '180 days'`.
- **Imutabilidade de Movimentações e Códigos de Barras:**
  - `trg_proteger_movimentacao` bloqueia `UPDATE` e `DELETE` na tabela `movimentacoes`.
  - `trg_equipamentos_codigo_barras_imutavel` bloqueia qualquer `UPDATE` na coluna `codigo_barras_interno` de `equipamentos` (`R6`).

---

## 5. Rate Limit, Cabeçalhos e Redação de Logs (`A1-17`, `A1-21`, `A2-20`)

- **Rate Limit no Login:** `@fastify/rate-limit` aplica limite de **5 tentativas por minuto por IP** especificamente em `POST /api/v1/auth/login`, retornando `429 LIMITE_REQUISICOES`.
- **Helmet e CORS:** `@fastify/helmet` adiciona cabeçalhos de proteção HTTP; `@fastify/cors` valida a origem contra a lista `CORS_ORIGENS` (quando vazia, nega qualquer origem cross-origin externa).
- **Redação de Dados Sensíveis nos Logs:** o logger Pino (`src/lib/logger.ts`) configura `redact` para substituir por `[REDACTED]` qualquer ocorrência de `senha`, `senhaHash`, `token`, `req.headers.authorization` e `headers.authorization`.
- **Supressão de Detalhes Internos em Erros 500:** erros inesperados recebem log `fatal` interno, mas retornam ao cliente apenas `{ erro: "ERRO_INTERNO", mensagem: "Erro interno do servidor.", severidade: "CRITICO", detalhes: [] }`, sem expor SQL ou stack trace.

---

## 6. Tabela de Cenários de Falha Testados (`A1-23`)

| Cenário de Falha / Ameaça | Resposta do Sistema | Arquivo e Teste Automatizado que Prova |
|---|---|---|
| Requisição sem token JWT | `401 NAO_AUTENTICADO` | `tests/integration/seguranca/auth-usuarios-parametros.test.ts` (`token ausente (401)`) |
| Token JWT expirado | `401 TOKEN_INVALIDO` | `tests/integration/seguranca/auth-usuarios-parametros.test.ts` (`token expirado (401)`) |
| Token JWT com assinatura adulterada | `401 TOKEN_INVALIDO` | `tests/integration/seguranca/auth-usuarios-parametros.test.ts` (`token adulterado (401)`) |
| Login com senha incorreta vs. e-mail inexistente | `401 NAO_AUTENTICADO` com corpo JSON idêntico | `tests/integration/seguranca/auth-usuarios-parametros.test.ts` (`login com senha errada e com e-mail inexistente devolvem respostas idênticas (401)`) |
| Usuário desativado tentando login ou renovação | `401 NAO_AUTENTICADO` | `tests/integration/seguranca/auth-usuarios-parametros.test.ts` (`usuário inativo (401)`) |
| Força bruta no login (6ª tentativa do mesmo IP) | `429 LIMITE_REQUISICOES` | `tests/integration/seguranca/auth-usuarios-parametros.test.ts` (`aplica rate limit no POST /api/v1/auth/login retornando 429 na 6ª tentativa do mesmo IP`) |
| `AUDITOR` tentando escrever em qualquer recurso | `403 SEM_PERMISSAO` | `tests/integration/seguranca/auth-usuarios-parametros.test.ts` (`auditor tentando escrever em CADA recurso (403)`) |
| `OPERADOR_CADASTRO` tentando criar lote ou acessar relatórios/auditoria | `403 SEM_PERMISSAO` | `tests/integration/logistica/nucleo-logistico.test.ts` (`nega OPERADOR_CADASTRO ao tentar criar lote`) e `tests/integration/relatorio/auditoria-rastreabilidade-relatorios.test.ts` |
| `GESTOR_ALMOXARIFADO` tentando acessar relatórios/auditoria ou escrever organização | `403 SEM_PERMISSAO` | `tests/integration/relatorio/auditoria-rastreabilidade-relatorios.test.ts` e `tests/integration/organizacao/organizacao-contrato.test.ts` |
| `ADMIN` tentando desativar a si mesmo ou o último admin ativo | `422 AUTO_DESATIVACAO_PROIBIDA` / `ULTIMO_ADMIN_ATIVO` | `tests/unit/seguranca/usuario-auth-parametro.service.test.ts` e `tests/integration/seguranca/auth-usuarios-parametros.test.ts` |
| Vazamento de `senhaHash` em respostas de `/usuarios` | Campo ausente em `POST`, `GET` e `PATCH` | `tests/integration/seguranca/auth-usuarios-parametros.test.ts` (`senhaHash ausente em todas as respostas de usuário`) |
| Vazamento de senha ou token JWT nos logs | Substituído por `[REDACTED]` | `tests/integration/seguranca/auth-usuarios-parametros.test.ts` (`segredo e senha ausentes nos logs`) |
| `UPDATE` ou `DELETE` direto na tabela `auditorias` (sem variável definida ou `< 180` dias) | Bloqueado por trigger PostgreSQL (`P0001`) | `tests/integration/acabamento/acabamento-fase8.test.ts` (`trigger da Auditoria com variável nunca definida` e `retenção de 180 dias`) |
| `UPDATE` ou `DELETE` direto na tabela `movimentacoes` | Bloqueado por trigger PostgreSQL (`P0001`) | `tests/integration/logistica/nucleo-logistico.test.ts` (`UPDATE e DELETE em movimentacoes bloqueados pelo trigger`) |
| `UPDATE` direto em `equipamentos.codigo_barras_interno` | Bloqueado por trigger PostgreSQL (`P0001`) | `tests/integration/logistica/nucleo-logistico.test.ts` (`garante código de barras único (409) e imutável no banco via trigger (R6)`) |
| Dois updates simultâneos na mesma `versao` | Um `200 OK` e um `409 CONFLITO_DE_VERSAO` | `tests/integration/logistica/nucleo-logistico.test.ts` (`teste obrigatório (a): dois updates concorrentes`) |
| Falha no meio da transação ao gravar auditoria | Rollback completo no banco | `tests/integration/logistica/nucleo-logistico.test.ts` (`teste obrigatório (b): falha injetada no meio da $transaction`) |
| Erro 500 inesperado contendo SQL/stack | Resposta genérica `500 ERRO_INTERNO` sem vazar detalhes | `tests/integration/acabamento/acabamento-fase8.test.ts` (`formato padronizado de erro`) |

---

## 7. Riscos Residuais

1. **Acesso privilegiado direto ao PostgreSQL (`greencode.limpeza`):** quem possui credenciais de banco com permissão de sessão pode definir `SET LOCAL greencode.limpeza = 'on'` para apagar auditorias com mais de 180 dias (ou usar `session_replication_role = replica` se for superusuário). Em ambiente de produção, a mitigação recomendada é utilizar uma *role* de banco sem privilégio de superusuário para a API e uma *role* separada exclusiva para o job de retenção.
2. **Revogação de JWT antes da expiração:** tokens emitidos permanecem válidos até os 30 minutos de expiração caso não haja uma *deny-list* centralizada em memória/Redis.
3. **Dependência transitiva de desenvolvimento (`deepmerge-ts` no CLI do Prisma 6):** afeta apenas a CLI `prisma` em tempo de desenvolvimento, sem impacto no runtime da aplicação ou do `@prisma/client`.
