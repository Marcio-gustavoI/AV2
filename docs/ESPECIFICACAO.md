# ESPECIFICAÇÃO DO PROJETO GREENCODE (AV1 + AV2)

> **Fonte primária.** Este arquivo é a cópia literal do prompt mestre de execução.
> Releído no início de cada fase e antes da revisão final (protocolo 0.2).

---

# PROMPT MESTRE DE EXECUÇÃO: greencode (AV1 + AV2)

Você é um Engenheiro de Software Sênior e Tech Lead. Construa do zero, de forma autônoma e em fases, o projeto "greencode": um servidor monolítico com API REST para logística reversa de resíduos eletrônicos. As regras de negócio vêm da AV1 (originalmente uma CLI com arquivos criptografados) e a arquitetura exigida vem da AV2 (servidor HTTP + Prisma + PostgreSQL). Este documento contém toda a especificação. Não existe outra fonte.

---

## 0. PROTOCOLO DE TRABALHO (LEIA ANTES DE QUALQUER COISA)

### 0.1 Regras anti-alucinação (obrigatórias)
1. **Nunca afirme que algo funciona sem ter executado.** "Testes passam" só vale com a saída real do comando na mesma resposta. "Migração funciona" só vale depois de migrar um banco vazio.
2. **Nunca invente API, flag ou pacote.** Antes de usar uma biblioteca, verifique a versão instalada (`npm ls <pacote>`) e consulte a documentação oficial dessa versão. Isso vale especialmente para Prisma, Fastify, @fastify/jwt, @fastify/swagger, pino-roll e vitest, cujas configurações mudam entre versões maiores. Se a versão do Prisma for 7 ou superior, a configuração difere das anteriores (arquivo `prisma.config.ts`, adapter de driver, carregamento do `.env`); siga a documentação oficial da versão instalada e não a sua memória.
3. **Sem placeholders.** Proibido `TODO`, `FIXME`, funções vazias, `throw new Error("not implemented")`, mocks no código de produção ou dados falsos fora do seed e dos testes.
4. **TypeScript strict, sem `any`** (exceção justificada em comentário). Sem `@ts-ignore`.
5. **Não pule requisitos silenciosamente.** Se não puder cumprir algo, registre em `docs/PENDENCIAS.md` com o motivo e a alternativa adotada, e continue com a opção mais segura. Nunca omita nada no relatório final.
6. **Ambiguidade:** escolha a opção mais simples e robusta, registre em `docs/DECISOES.md` como decisão e em `docs/PENDENCIAS.md` como "confirmar com o professor". Não pare para perguntar, exceto nos pontos de parada da seção 0.3 e nos bloqueios da seção 0.4.
7. **Não faça mais do que o pedido** (seção 4 lista o que está fora de escopo). Não adicione funcionalidades extras que criem risco de bugs.
8. Antes de apagar ou sobrescrever qualquer arquivo que você não criou, pare e avise.

### 0.2 Gestão de contexto (para não esquecer requisitos em tarefas longas)
Primeira ação, antes de qualquer código:
- Salve este prompt, **literalmente**, em `docs/ESPECIFICACAO.md`.
- Crie `docs/PROGRESSO.md` (fase atual, o que está feito, o que falta, comandos que já foram validados).
- Releia `docs/ESPECIFICACAO.md` no início de cada fase e antes da revisão final.
- Atualize `docs/PROGRESSO.md` ao fim de cada fase.

### 0.3 Pontos de parada para revisão humana
- **PARADA 1:** ao fim da Fase 0 (plano + matriz). Mostre o resumo e espere eu responder "APROVADO".
- **PARADA 2:** ao fim da Fase 2 (schema + migrações), mostre o `schema.prisma` e o SQL das migrações e espere "APROVADO".
- Nas demais fases, continue sozinho e apenas reporte.

### 0.4 Bloqueios reais (único caso em que você deve parar e perguntar)
- Não há Docker nem PostgreSQL disponível no ambiente (verifique com `docker --version` e `psql --version`). Explique o que falta e como instalar. Não troque de banco sozinho.
- Ação destrutiva fora da pasta do projeto.

### 0.5 Ciclo obrigatório de cada fase
1. Reler a especificação da fase.
2. Implementar.
3. Rodar: `npm run typecheck`, `npm run lint`, testes da fase.
4. Corrigir até ficar verde (se travar após 3 tentativas na mesma falha, registre em PENDENCIAS.md e explique).
5. Atualizar `docs/RASTREABILIDADE.md` (requisito → arquivo → teste).
6. Commit: `fase-N: descrição` (Conventional Commits).
7. Reportar em até 10 linhas: o que foi feito, saída resumida dos testes, pendências.

---

## 1. CONTEXTO DE NEGÓCIO
Startup intermediária entre grandes geradores de resíduos eletrônicos (bancos, varejo, hospitais, universidades) e a cadeia de recuperação (operadores logísticos, desmontagem, mercado de matérias-primas secundárias). O sistema rastreia cada equipamento da organização geradora até o destino final, de forma auditável, em conformidade com a rastreabilidade exigida pela Política Nacional de Resíduos Sólidos. A arquitetura deve permitir evoluir para outros tipos de produto (baterias, painéis solares, dispositivos médicos) sem reescrever o núcleo.

---

## 2. MATRIZ DE REQUISITOS (a "rubrica" do professor)
Status: MANTIDO = implementar igual; ADAPTADO = mesma intenção, outro mecanismo; SUBSTITUÍDO = deixa de existir, justificar em DECISOES.md.
Crie `docs/RASTREABILIDADE.md` com UMA linha por ID abaixo: ID | requisito | status | arquivo(s) | teste(s) que provam. Nenhuma linha pode ficar vazia no final.

### 2.1 Requisitos herdados da AV1
| ID | Requisito | Status | Como cumprir na AV2 |
|---|---|---|---|
| A1-01 | 4 papéis: administrador, operador de cadastro, gestor de almoxarifado, auditor, com segregação de responsabilidades | ADAPTADO | Enum `Papel` + autorização por papel (seção 9) |
| A1-02 | Admin: contas de acesso e parâmetros globais (alíquotas de imposto, coeficientes de depreciação) | MANTIDO | Rotas /usuarios e /parametros |
| A1-03 | Operador: insere organizações clientes e contratos de coleta | MANTIDO | Rotas /organizacoes e contrato |
| A1-04 | Gestor: chegada de lotes, triagem, alocação de códigos de barras internos | MANTIDO | Rotas /lotes, /equipamentos, triagem |
| A1-05 | Auditor: somente consulta e relatórios, sem nenhuma alteração | MANTIDO | Qualquer escrita retorna 403 (teste) |
| A1-06 | Senhas com hash SHA-256 | SUBSTITUÍDO | bcrypt (ver contradição C1) |
| A1-07 | Sessão expira após 30 min de inatividade | ADAPTADO | JWT 30 min + /auth/renovar (ver C4) |
| A1-08 | Modelagem OO: herança, interfaces, polimorfismo, classes abstratas de validação, fábricas | MANTIDO | `src/domain/` (seção 6) |
| A1-09 | Provisionamento inicial: criar primeiro admin; sem arquivo mestre, entra em modo de provisionamento | ADAPTADO | `npm run criar-admin`; sistema não sobe com admin padrão |
| A1-10 | Arquivos criptografados com AES-256 | SUBSTITUÍDO | Dados no PostgreSQL; justificar (ver C2) |
| A1-11 | Escrita atômica (temp + rename) | ADAPTADO | `prisma.$transaction` |
| A1-12 | CNPJ com dígitos verificadores e único | MANTIDO | R1 |
| A1-13 | Lote: data de entrada não futura nem anterior a 90 dias | MANTIDO | R2 |
| A1-14 | Desmonte só após triagem completa | MANTIDO | R3 |
| A1-15 | Justificativa obrigatória se estado físico cair 2 categorias | MANTIDO | R4 |
| A1-16 | Journal de transações retido por no mínimo 180 dias | ADAPTADO | Tabela Auditoria + comando de retenção (seção 12) |
| A1-17 | Rotação do journal ao passar de 10 MB | ADAPTADO | Rotação do log de aplicação em arquivo (seção 12) |
| A1-18 | Interface CLI com readline, autocompletar, histórico | SUBSTITUÍDO | API REST + Swagger (justificar) |
| A1-19 | Menu se adapta ao papel do usuário | ADAPTADO | `GET /auth/me` devolve papel e permissões |
| A1-20 | Comandos com ação principal + parâmetros (ex.: `lote criar --org BR001 --nf 123456 --transp TransRapida`) | ADAPTADO | Tabela comando→rota em ARQUITETURA.md; esse exemplo vira `POST /api/v1/lotes` com `orgCodigo`, `notaFiscal`, `transportadora` |
| A1-21 | Feedback com mensagens categorizadas por severidade | ADAPTADO | Campo `severidade` nas respostas de erro + níveis de log |
| A1-22 | Scripts que simulam jornada completa, do provisionamento à rastreabilidade | MANTIDO | `npm run jornada` |
| A1-23 | Documentar arquitetura de segurança (cripto, hash, sessão) e cenários de falha com respostas | MANTIDO | `docs/SEGURANCA.md` |
| A1-24 | Cada transação registrada em log imutável antes de aplicada ao estado | ADAPTADO | Auditoria gravada na mesma transação, imutável por trigger |
| A1-25 | Windows 10+ e Ubuntu 24.04.03+ (e derivados) | MANTIDO | Seção 16 |

### 2.2 Requisitos da AV2
| ID | Requisito |
|---|---|
| A2-01 | Monólito Node.js + TypeScript expondo API RESTful |
| A2-02 | Camadas Controller → Service → Repository; services com toda a regra de negócio, independentes de HTTP |
| A2-03 | Fastify (preferido), rotas declarativas, validação por JSON Schema, hooks (auth/log), plugins |
| A2-04 | Porta configurável por variável de ambiente |
| A2-05 | Graceful shutdown |
| A2-06 | `schema.prisma` com Organizacao, Contrato, Lote, Equipamento, Movimentacao e relacionamentos: Organizacao 1—0..1 Contrato; Organizacao 1—N Lote; Lote 1—N Equipamento; Equipamento 1—N Movimentacao |
| A2-07 | Migrações versionadas do Prisma |
| A2-08 | PostgreSQL |
| A2-09 | Unicidade no banco de CNPJ e codigoBarrasInterno |
| A2-10 | Constraints e/ou triggers contra estados inconsistentes |
| A2-11 | Uso de include/select (eager loading, seleção de campos) |
| A2-12 | Login com bcrypt, JWT com id e papel, header Authorization, hook global, services consultam o papel |
| A2-13 | `$transaction` em: criar lote com equipamentos; atualizar status + registrar movimentação |
| A2-14 | Versionamento otimista (campo `versao` verificado em todo update) |
| A2-15 | Seed com massa representativa (orgs, contratos, lotes, equipamentos em estados variados) refletindo os cenários de validação |
| A2-16 | API documentada (OpenAPI/Swagger) |
| A2-17 | Decisões arquiteturais justificadas com trade-offs e alternativas rejeitadas |
| A2-18 | Reflexão sobre os limites do monólito |
| A2-19 | Compatível com Windows 10+ e Ubuntu 24.04.03+ |
| A2-20 | Pronto para ser consumido por front-end SPA (CORS configurável por ambiente) |

---

## 3. CONTRADIÇÕES E LACUNAS: DECISÕES JÁ TOMADAS
Implemente exatamente assim e documente cada uma em DECISOES.md (Contexto → Decisão → Alternativas rejeitadas → Consequências).

- **C1. Hash de senha:** a AV1 diz SHA-256; a AV2 diz bcrypt "como no CLI". Decisão: **bcryptjs** (JavaScript puro, sem compilação nativa, funciona igual no Windows e no Ubuntu), custo (salt rounds) configurável por env, padrão 12. Justificar: SHA-256 é rápido demais (favorece força bruta) e não tem salt/custo adaptativo embutidos.
- **C2. AES-256 dos arquivos e chave mestra:** deixam de existir porque não há mais arquivos de dados. Documentar que a proteção passa a ser: credenciais do banco apenas via env, acesso de rede restrito ao banco, disco criptografado no servidor, segredos fora do repositório. Não implemente criptografia de campos.
- **C3. Provisionamento inicial:** o "modo de provisionamento" vira `npm run criar-admin` (interativo ou via env `ADMIN_EMAIL`/`ADMIN_SENHA`). O sistema nunca cria admin com senha padrão.
- **C4. Sessão por inatividade:** JWT é stateless, então a expiração é por tempo (30 min, configurável por env). Para simular inatividade, `POST /auth/renovar` emite novo token a partir de um token ainda válido. Documentar a limitação (sem revogação imediata de token) em SEGURANCA.md e em "Limites".
- **C5. UML ausente:** o diagrama da AV1 não foi fornecido. Os nomes de classes, enums e campos deste prompt são **suposições**. Registre isso em DECISOES.md e produza o UML (Mermaid) do que foi realmente implementado.
- **C6. Contrato opcional:** a AV2 diz que a organização tem contrato opcional. Decisão: **não** exigir contrato vigente para criar lote. Registrar em PENDENCIAS.md como "confirmar com o professor".
- **C7. ADMIN:** a AV1 prevê "um único usuário com privilégios elevados". Decisão: ADMIN pode executar todas as operações de todos os papéis.
- **C8. Versionamento em modelos imutáveis:** `Movimentacao` e `Auditoria` são append-only. `Movimentacao` recebe o campo `versao` (sempre 1) por conformidade literal com a AV2; `Auditoria` não recebe, com justificativa em DECISOES.md.
- **C9. Validação:** use JSON Schema (diferencial do Fastify exigido pela AV2). Use `@fastify/type-provider-typebox` ou equivalente que gere JSON Schema + tipos TypeScript; confirme compatibilidade de versões antes de adotar. Não misture com Zod nas rotas.

---

## 4. FORA DE ESCOPO (não implementar)
Front-end, microsserviços, filas/mensageria, e-mail, certificados de compensação ambiental, marketplace de materiais, cotação de commodities, CLI interativa, upload de arquivos, multi-tenant. Cite no relatório apenas como evolução futura.

---

## 5. STACK E FERRAMENTAS
- Node.js LTS atual (>= 22). Declare em `engines` e `.nvmrc`. README deve mostrar como instalar via nvm (Linux/macOS) ou nvm-windows/instalador oficial (Windows), pois o `apt` do Ubuntu 24.04 traz versão antiga.
- TypeScript strict, `tsx` para desenvolvimento, build para `dist/` com `tsc`.
- Fastify + `@fastify/jwt` + `@fastify/swagger` + `@fastify/swagger-ui` + `@fastify/cors` + `@fastify/helmet` + `@fastify/rate-limit`.
- Prisma ORM + PostgreSQL. Dinheiro sempre `Decimal` (nunca `float`).
- `bcryptjs`, `pino` (+ rotação por tamanho, ex.: `pino-roll`; confirme na doc que suporta `size`), `vitest`, `eslint` + `prettier`.
- Fixe versões exatas no `package.json` após instalar e mantenha o lockfile no repositório.

---

## 6. ARQUITETURA E ESTRUTURA

Camadas:
- **Controller/rotas:** só HTTP (ler parâmetros validados, chamar service, devolver status e corpo).
- **Service:** toda regra de negócio, validações, autorização por papel, transações. **Não importa Fastify nem Prisma diretamente** (recebe repositórios por injeção de dependência pelo construtor).
- **Repository:** único lugar que usa o Prisma Client. Sem regra de negócio.
- **Domain (`src/domain/`):** sem dependência de framework. Contém enums, erros de domínio, validadores, fábricas e regras puras.

Orientação a objetos (A1-08), de forma real e não decorativa:
- Classe abstrata `Validador<T>` (template method: `validar(entrada)` coleta erros) com `ValidadorCnpj`, `ValidadorLote`, `ValidadorMovimentacao`.
- Interfaces dos repositórios (`OrganizacaoRepository`, `LoteRepository`...), com implementação Prisma. Os testes de service usam implementação em memória.
- Fábricas: `LoteFactory` (monta lote + equipamentos válidos), `MovimentacaoFactory`.
- Polimorfismo: estratégia de transição por status (`RegraTransicao` com uma implementação por status de destino, ex.: `RegraDesmonte` exige triagem). Evite `if/else` gigante.
- Interface `Relogio` (`agora(): Date`) injetada nos services para testar R2 sem depender da data real.

Estrutura:
```
greencode/
├── docs/ (ESPECIFACAO, PROGRESSO, PENDENCIAS, DECISOES, ARQUITETURA, SEGURANCA, RASTREABILIDADE)
├── prisma/ (schema.prisma, migrations/, seed.ts)
├── scripts/ (criar-admin.ts, jornada.ts, limpar-auditoria.ts)
├── src/
│   ├── server.ts        # lê env, sobe, shutdown
│   ├── app.ts           # monta Fastify, plugins, rotas
│   ├── config/env.ts    # valida variáveis (falha com mensagem clara)
│   ├── plugins/         # jwt, swagger, cors, helmet, rate-limit, error-handler, auditoria
│   ├── domain/          # enums, erros, validators, factories, regras
│   ├── modules/<auth|usuario|parametro|organizacao|contrato|lote|equipamento|movimentacao|relatorio|auditoria>/
│   │                    #   cada um: controller, service, repository, schemas
│   └── lib/             # prisma client, relogio, logger, paginacao
├── tests/ (unit/, integration/, helpers/)
├── .env.example  .gitignore  .gitattributes  .nvmrc
├── docker-compose.yml  package.json  tsconfig.json  eslint config
└── README.md
```

---

## 7. MODELO DE DADOS (Prisma)
IDs `uuid`. Datas em UTC. Nomes dos modelos em português sem acento.

- **Usuario:** id, email (único, normalizado minúsculo), senhaHash, papel, ativo, versao, criadoEm.
- **Parametro:** chave (PK), valor (Decimal, >= 0), versao, atualizadoEm. Chaves iniciais: `ALIQUOTA_IMPOSTO` e `COEF_DEPRECIACAO_<TIPO>` para cada `TipoEquipamento`.
- **Organizacao:** id, codigo (único, ex.: "BR001"), cnpj (único, **somente 14 caracteres normalizados**, sem pontuação), nome, versao, criadoEm. Relações: contrato opcional, lotes.
- **Contrato:** id, organizacaoId (único), numero (único), clausulas (Json opcional), inicio, fim (opcional, >= inicio), versao.
- **Lote:** id, organizacaoId, notaFiscal, transportadora, dataEntrada, versao, criadoEm. Relação: equipamentos.
- **Equipamento:** id, loteId, codigoBarrasInterno (único, imutável), tipo (`TipoEquipamento`), descricao, valorAquisicao (Decimal opcional >= 0), estadoFisico, status, triagemCompleta (boolean), classificacaoDestino (opcional, `ClassificacaoDestino`), versao, criadoEm.
- **Movimentacao:** id, equipamentoId, statusAnterior, statusNovo, estadoAnterior, estadoNovo, justificativa (opcional), usuarioId, versao (sempre 1), criadoEm. Imutável.
- **Auditoria:** id, usuarioId (opcional), acao, entidade, entidadeId, antes (Json), depois (Json), criadoEm. Append-only.

Enums:
- `Papel`: ADMIN, OPERADOR_CADASTRO, GESTOR_ALMOXARIFADO, AUDITOR
- `EstadoFisico` (ordem numérica explícita no domínio): SUCATA=0, RUIM=1, REGULAR=2, BOM=3, EXCELENTE=4
- `StatusEquipamento`: RECEBIDO, EM_TRIAGEM, TRIADO, EM_DESMONTE, DESMONTADO, DESTINADO
- `TipoEquipamento`: DESKTOP, NOTEBOOK, MONITOR, SERVIDOR, PERIFERICO, REDE, OUTRO
- `ClassificacaoDestino`: REUTILIZACAO, RECICLAGEM, DESCARTE_SEGURO

Índices em chaves estrangeiras e em campos de filtro (status, organizacaoId, criadoEm).

**Migrações:**
1. Migração inicial gerada pelo Prisma.
2. Segunda migração criada com `--create-only` e **editada à mão em SQL**, contendo:
   - CHECK: `Parametro.valor >= 0`; `Equipamento.valorAquisicao >= 0`; `Contrato.fim >= inicio`; `Lote.dataEntrada` não futura (usar o relógio do banco, e documentar que a regra dos 90 dias fica no service por depender de regra de negócio).
   - CHECK: `triagemCompleta = true` implica `classificacaoDestino IS NOT NULL`.
   - TRIGGER na tabela Auditoria bloqueando UPDATE e DELETE (e TRUNCATE se viável), com exceção controlada para a retenção: o DELETE só é permitido se a variável de sessão `greencode.limpeza = 'on'` (definida com `SET LOCAL` dentro da transação do comando de limpeza) **e** o registro tiver mais de 180 dias. Documentar a limitação (quem tem acesso ao banco pode definir a variável) e a alternativa mais forte (role de banco separada) em SEGURANCA.md e DECISOES.md.
   - TRIGGER (ou CHECK) que impede inserir Movimentacao onde `statusAnterior = statusNovo` e `estadoAnterior = estadoNovo` ao mesmo tempo.
3. A migração deve funcionar em banco vazio (`prisma migrate reset` ou `migrate deploy`).

---

## 8. REGRAS DE NEGÓCIO (todas no Service, cada uma com teste)
- **R1 CNPJ (A1-12):** normalizar (remover pontuação), exigir 14 caracteres, rejeitar sequências repetidas (ex.: "00000000000000"), validar os dois dígitos verificadores com o algoritmo oficial. Unicidade garantida pelo banco; erro de unicidade do Prisma (código P2002) vira 409. Sobre CNPJ alfanumérico (vigente no Brasil a partir de 2026): verifique a regra oficial da Receita Federal por pesquisa; se confirmar que o cálculo é o mesmo com valor = código ASCII − 48, aceite letras e dígitos; se não conseguir confirmar, aceite apenas numérico e registre em DECISOES.md.
- **R2 Lote (A1-13):** `dataEntrada` não pode ser posterior ao dia atual nem anterior a 90 dias antes de hoje. Exatamente 90 dias é permitido. Comparar por dia de calendário no fuso `TZ_NEGOCIO` (padrão `America/Sao_Paulo`) usando a interface `Relogio`. Testes de borda obrigatórios: hoje, ontem, amanhã, 90 dias atrás, 91 dias atrás.
- **R3 Desmonte (A1-14):** status EM_DESMONTE e DESMONTADO exigem `triagemCompleta = true`.
- **R4 Justificativa (A1-15):** se `valor(estadoNovo) <= valor(estadoAnterior) − 2`, `justificativa` (texto não vazio, mínimo 10 caracteres) é obrigatória. Queda de 1 nível ou melhora não exige.
- **R5 Fluxo de status:** apenas RECEBIDO → EM_TRIAGEM → TRIADO → EM_DESMONTE → DESMONTADO → DESTINADO, sem pular nem voltar. Transição inválida = erro de regra de negócio (422).
- **R6 Código de barras (A1-04):** gerado pelo sistema na criação do equipamento (formato `GC-` + número sequencial com zeros à esquerda, obtido de uma SEQUENCE do PostgreSQL criada na migração ou mecanismo equivalente seguro contra concorrência), único e imutável. Se o cliente enviar um código manual, validar formato e unicidade (409).
- **R7 Atomicidade e journal (A1-11, A1-24, A2-13):** toda mudança de status/estado grava, **na mesma `$transaction`**: atualização do equipamento (com checagem de versão), `Movimentacao` e `Auditoria`. Se qualquer passo falhar, nada é persistido. Criar lote com N equipamentos também é uma única transação (todos ou nenhum), com auditoria.
- **R8 Financeiro:** `valorResidual = valorAquisicao × (1 − coeficienteDepreciação(tipo))` e `imposto = valorResidual × alíquota`, lendo `Parametro`. Aritmética com `Decimal`, arredondamento a 2 casas e regra documentada. Equipamento sem `valorAquisicao` fica fora do total e é contado à parte. Registrar a fórmula como **suposição** em DECISOES.md.
- **R9 Triagem:** `POST /equipamentos/:id/triagem` exige status EM_TRIAGEM, recebe `classificacaoDestino` e `estadoFisico` apurado; ao concluir, define `triagemCompleta = true` e move para TRIADO (registrando Movimentacao e Auditoria). Só o GESTOR_ALMOXARIFADO e o ADMIN podem executar.
- **R10 Movimentação:** uma movimentação deve alterar status, estado físico ou ambos. Movimentação sem mudança retorna 422. Mudança de estado físico sem mudança de status é permitida (reavaliação).
- **R11 Integridade:** lote exige organização existente (aceita `orgCodigo` ou `organizacaoId`, resolvendo o código no service); equipamento exige lote existente; organização com lotes não pode ser excluída (não implemente DELETE de entidades de negócio; use `ativo`/desativação apenas para usuários).
- **R12 Usuários:** usuário inativo não faz login; o ADMIN não pode desativar a si mesmo nem o último admin ativo. E-mail único (409). Senha com no mínimo 10 caracteres, contendo letras e números.

---

## 9. AUTENTICAÇÃO E AUTORIZAÇÃO
- `POST /auth/login`: valida com bcrypt, emite JWT `{ sub, papel }` com expiração `JWT_EXPIRA_EM` (padrão 30m). Resposta de falha **idêntica** para e-mail inexistente e senha errada, e comparação com hash "falso" quando o usuário não existe (evita enumeração e ataque de tempo). Rate limit específico no login (ex.: 5 tentativas/minuto por IP) retornando 429.
- `POST /auth/renovar` e `GET /auth/me` (papel e lista de permissões, equivalente ao "menu por papel").
- Hook global de autenticação: valida o token, injeta `request.usuario`. Públicas: `/auth/login`, `/saude`, `/docs`.
- Autorização por papel em função reutilizável (`exigirPapel([...])`), e os **services também validam o papel** recebido (defesa em profundidade, como pede a AV2).
- Nunca retornar `senhaHash`. Nunca logar senha, token ou header Authorization (usar `redact` do pino).
- `JWT_SECRET` com no mínimo 32 caracteres, validado na inicialização.

Matriz de permissões (R = leitura, W = escrita):
| Recurso | ADMIN | OPERADOR_CADASTRO | GESTOR_ALMOXARIFADO | AUDITOR |
|---|---|---|---|---|
| Usuários, Parâmetros | R/W | negado | negado | negado |
| Organizações, Contratos | R/W | R/W | R | R |
| Lotes, Equipamentos, Triagem, Movimentações | R/W | R | R/W | R |
| Rastreabilidade | R | R | R | R |
| Relatórios, Auditoria | R | negado | negado | R |

Documente e teste a matriz inteira (a tabela de testes deve cobrir cada célula "negado" e a tentativa de escrita do AUDITOR em cada recurso).

---

## 10. API
Prefixo `/api/v1` (exceto `/saude` e `/docs`). Todas as rotas com schema JSON de entrada e saída, tags e descrições no Swagger em `/docs`.

- `GET /saude` (público; verifica conexão com o banco)
- Auth: `POST /auth/login`, `POST /auth/renovar`, `GET /auth/me`
- `POST|GET /usuarios`, `GET|PATCH /usuarios/:id`
- `GET|PUT /parametros`, `PUT /parametros/:chave`
- `POST|GET /organizacoes`, `GET|PATCH /organizacoes/:id`
- `POST|PATCH|GET /organizacoes/:id/contrato`
- `POST|GET /lotes` (POST aceita `orgCodigo`, `notaFiscal`, `transportadora`, `dataEntrada`, `equipamentos[]`), `GET /lotes/:id`
- `POST|GET /equipamentos`, `GET /equipamentos/:id`
- `POST /equipamentos/:id/triagem`
- `POST /equipamentos/:id/movimentacoes`
- `GET /equipamentos/:id/rastreabilidade` (equipamento, lote, organização, linha do tempo de todas as movimentações em ordem cronológica, com usuário responsável)
- `GET /relatorios/resumo` (contagem por status, estado físico, organização e período) e `GET /relatorios/financeiro` (R8)
- `GET /auditoria` (filtros por usuário, entidade, ação, intervalo de datas; paginação)

Convenções:
- Listagens com `pagina` (padrão 1) e `tamanhoPagina` (padrão 20, máximo 100), resposta `{ dados, paginacao: { pagina, tamanhoPagina, total, totalPaginas } }`.
- Use `include`/`select` do Prisma de forma intencional (A2-11): listagens devolvem campos resumidos, detalhes devolvem relações; evite N+1 e documente um exemplo em ARQUITETURA.md.
- Updates exigem `versao` no corpo; a resposta devolve o registro com a nova `versao`.
- Formato de erro padronizado: `{ "erro": "CODIGO_ESTAVEL", "mensagem": "texto claro em português", "severidade": "AVISO|ERRO|CRITICO", "detalhes": [...] }`. Mapeamento: 400 validação (AVISO), 401 (ERRO), 403 (ERRO), 404 (AVISO), 409 conflito de unicidade ou versão (AVISO), 422 regra de negócio (AVISO), 429 (AVISO), 500 inesperado (CRITICO, mensagem genérica ao cliente, detalhes só no log). Erro do Prisma P2002 → 409; P2025 → 404. Nunca vazar stack trace ou SQL ao cliente.
- CORS por env (`CORS_ORIGENS`, lista separada por vírgula; vazio = bloqueia origens externas), conforme A2-20.

---

## 11. TRANSAÇÕES E CONCORRÊNCIA
- Todo update de entidade versionada: `updateMany({ where: { id, versao }, data: { ..., versao: { increment: 1 } } })`. Se `count === 0`, verificar se o registro existe (404) ou se a versão divergiu (`ConflitoDeVersaoError` → 409), dentro da mesma transação.
- Use `$transaction` interativa nos fluxos da R7 e na criação de lote.
- Testes obrigatórios: (a) dois updates concorrentes com a mesma `versao` → um 200 e um 409 (use `Promise.all`); (b) falha injetada no meio da transação (ex.: auditoria forçada a falhar) → provar com consulta ao banco que equipamento, movimentação e lote não foram alterados; (c) criação de lote com 1 equipamento inválido → nenhum equipamento nem lote persistido.

---

## 12. AUDITORIA, LOGS E RETENÇÃO
- Tabela `Auditoria` é o journal imutável (A1-16/A1-24). Todo POST/PATCH/PUT que altera dados grava auditoria dentro da transação do service (não em hook pós-resposta, para garantir o "antes de aplicar" atomicamente).
- `npm run limpar-auditoria`: abre transação, faz `SET LOCAL greencode.limpeza = 'on'`, apaga somente registros com mais de 180 dias (parâmetro `AUDITORIA_RETENCAO_DIAS`, **mínimo aceito 180**; valores menores são rejeitados), imprime quantos removeu. Teste: registro de 179 dias não é apagado; de 181 dias é; e DELETE direto sem a variável é bloqueado.
- Log de aplicação (pino) em arquivo dentro de `logs/` (use `path.join`), com rotação ao atingir 10 MB e retenção de arquivos antigos, além de saída no console. Níveis: info/warn/error/fatal mapeados à `severidade`. Registrar requisições (método, rota, status, duração, usuário), nunca corpo com senha. Teste ou script de verificação demonstrando a rotação (pode usar tamanho reduzido por env em teste).

---

## 13. SERVIDOR
- `PORT` (padrão 3000), `HOST` (padrão 0.0.0.0), validação de TODAS as variáveis no boot; falha com mensagem clara listando o que falta (`DATABASE_URL`, `JWT_SECRET` etc.). `.env.example` completo e comentado.
- Graceful shutdown: tratar `SIGINT` e `SIGTERM` (e `SIGBREAK` no Windows se disponível), parar de aceitar conexões, aguardar requisições em andamento com timeout configurável, `app.close()`, `prisma.$disconnect()`, sair com código 0. Segundo sinal força saída. Teste automatizado: subir o servidor como processo filho, enviar `SIGINT`, verificar saída limpa. Se o teste de `SIGTERM` não for confiável no Windows, marque como pulado nesse SO com justificativa (e não oculte).

---

## 14. SEED E JORNADA
- `npx prisma db seed` idempotente (rodar duas vezes não duplica nem falha; use `upsert`). Cria: 1 usuário por papel (senhas de desenvolvimento listadas no README, e o seed **recusa** rodar com `NODE_ENV=production`), parâmetros, 4+ organizações (com e sem contrato, CNPJs válidos), lotes (incluindo um com 90 dias de idade), equipamentos em **todos os status e estados físicos**, movimentações históricas, e auditoria coerente.
- O seed deve conter dados que exercitem as validações (ex.: equipamento pronto para tentar desmonte sem triagem, equipamento que sofreu queda de 2 níveis com justificativa). Dados inválidos para teste ficam nos testes, não no seed.
- `npm run jornada` (A1-22): script Node que contra o servidor em execução (URL por env) faz: criar/obter admin → login → criar organização → contrato → lote com equipamentos → triagem → movimentações → desmonte → destinado → rastreabilidade → relatório. Imprime ✔/✘ por passo, encerra com código ≠ 0 se algo falhar, e também executa 3 cenários de falha esperados (CNPJ inválido, desmonte sem triagem, auditor tentando escrever) confirmando as respostas.

---

## 15. TESTES (vitest)
- Banco de teste separado (`DATABASE_URL_TEST`), preparado por script (`npm run test:db:preparar`), com limpeza entre testes que respeite o trigger da Auditoria (helper de teste com a exceção controlada).
- Unitários (domínio e services com repositórios em memória) e integração (Fastify `inject` + banco real).
- Cobertura obrigatória, um teste nomeado para cada item: CNPJ inválido; CNPJ com dígitos repetidos; CNPJ duplicado (409); lote data futura; lote data de 91 dias; lote de exatamente 90 dias (aceito); desmonte sem triagem; queda de 2 níveis sem justificativa (422); queda de 1 nível sem justificativa (aceita); transição de status inválida; movimentação sem mudança; auditor tentando escrever em CADA recurso (403); cada célula "negado" da matriz; token ausente (401); token expirado (401); token adulterado (401); login com senha errada e com e-mail inexistente (respostas idênticas); usuário inativo; conflito de versão (409) e concorrência simultânea; transação revertida; trigger bloqueando UPDATE/DELETE na Auditoria; retenção de 180 dias; `senhaHash` ausente em todas as respostas de usuário; segredo/senha ausentes nos logs; paginação (limite máximo); formato padronizado de erro; graceful shutdown; seed idempotente; código de barras único e imutável; cálculo financeiro com casos numéricos conferidos à mão.
- Meta de cobertura: >= 85% nos services e no domínio. Gere o relatório de cobertura e informe o número real.

---

## 16. PORTABILIDADE (Windows 10+ / Ubuntu 24.04+)
- Scripts npm somente com comandos portáveis; sem `rm -rf`, `export VAR=`, `$VAR` ou scripts `.sh` (para tarefas de arquivo use Node ou `rimraf`/`cross-env` se necessário). Preferir `node --env-file` ou `dotenv` para variáveis.
- `path.join`/`path.resolve` para qualquer caminho. Nenhum caminho absoluto fixo.
- `.gitattributes` com `* text=auto eol=lf` (evita quebra de scripts por fim de linha CRLF) e `.editorconfig`.
- Sem dependência nativa que exija compilador (por isso `bcryptjs`).
- README com seções separadas e testadas por comando: **Windows 10/11 (PowerShell)** e **Ubuntu 24.04**, incluindo instalação do Node, do Docker e alternativa com PostgreSQL já instalado (ajustando `DATABASE_URL`).
- `docker-compose.yml` com PostgreSQL (versão fixa), volume nomeado, healthcheck, credenciais via `.env`.
- Se viável, `.github/workflows/ci.yml` com job Linux completo (PostgreSQL como service) e job Windows para instalar, tipar, lintar e rodar os testes que não dependem de banco; documente o que ficou fora no Windows.
- Registre em DECISOES.md quais verificações foram realmente executadas em cada SO e quais não foram (não afirme teste em Windows se o ambiente não for Windows).

---

## 17. DOCUMENTAÇÃO (entregáveis avaliados)
1. **README.md:** pré-requisitos, instalação passo a passo para quem nunca usou o projeto, `.env`, banco, migrar, seed, rodar, testar, jornada, Swagger, usuários de teste, solução de problemas comuns.
2. **docs/DECISOES.md:** formato Contexto → Decisão → Alternativas rejeitadas → Consequências, para no mínimo: monólito vs microsserviços; camadas; Fastify vs Express; JSON Schema; Prisma vs SQL puro; PostgreSQL vs MySQL/SQLite; JWT vs sessão; bcrypt vs SHA-256 (C1); fim do AES-256 (C2); versionamento otimista vs lock pessimista; `$transaction`; Auditoria com trigger vs arquivo; rotação de log; retenção com exceção controlada; Docker Compose; autorização em duas camadas; Decimal vs float; todas as suposições C5/C6/R8. Termine com a seção **"Limites do monólito: quando eu dividiria?"** (escala independente de módulos, times grandes, deploy independente, isolamento de falhas, exemplos concretos neste domínio, e o caminho de evolução: módulos já isolados por pasta e por interface de repositório).
3. **docs/ARQUITETURA.md:** diagrama de camadas e ER em Mermaid, UML (Mermaid) do domínio realmente implementado, fluxo de uma requisição do cliente ao banco, tabela comando-da-AV1 → rota, tabela rota × papel.
4. **docs/SEGURANCA.md:** hash e custo, JWT e expiração/renovação e suas limitações, RBAC, auditoria imutável e retenção, rate limit, o que não é logado, **tabela de cenários de falha testados** (cenário → resposta do sistema → teste que prova), riscos residuais.
5. **docs/RASTREABILIDADE.md:** matriz completa (seção 2), sem linhas vazias.
6. **docs/PENDENCIAS.md:** itens a confirmar com o professor e qualquer limitação real.

---

## 18. FASES (execute na ordem; ciclo da seção 0.5 em cada uma)
- **Fase 0 – Planejamento.** Salvar especificação, criar docs/PROGRESSO.md, RASTREABILIDADE.md (todas as linhas), PENDENCIAS.md; verificar ferramentas (Node, npm, Docker, psql, git) e imprimir versões; listar riscos. **PARADA 1.**
- **Fase 1 – Base.** Projeto TS, lint, env validado, app Fastify com `/saude`, logger, error handler esqueleto, shutdown. Critério: sobe, responde, encerra limpo.
- **Fase 2 – Banco.** Prisma, schema, migração inicial + migração SQL manual (CHECKs e triggers), docker-compose. Critério: migrar do zero funciona, trigger bloqueia UPDATE/DELETE em teste manual com saída mostrada. **PARADA 2.**
- **Fase 3 – Domínio.** Enums, erros, validadores (CNPJ, lote, movimentação), fábricas, regras de transição, `Relogio`. Critério: testes unitários verdes.
- **Fase 4 – Organização/Contrato.** Repository + service + rotas, R1. Critério: testes de integração.
- **Fase 5 – Segurança.** Usuários, bcrypt, JWT, renovar, `/auth/me`, hooks, matriz de papéis, rate limit, `criar-admin`. Critério: testes de 401/403/429 e da matriz.
- **Fase 6 – Núcleo logístico.** Lote, Equipamento, Triagem, Movimentação com R2–R7, R9–R11, transações e versionamento. Critério: testes de concorrência e rollback.
- **Fase 7 – Auditoria e relatórios.** Auditoria transacional, consulta com filtros, rastreabilidade, parâmetros, R8, relatórios.
- **Fase 8 – Acabamento técnico.** Swagger completo, paginação, CORS/helmet, logs com rotação, `limpar-auditoria`, formato de erro final.
- **Fase 9 – Seed e jornada.** Seed idempotente e `npm run jornada`.
- **Fase 10 – Testes e documentação.** Completar a lista da seção 15, cobertura, os 5 documentos, README, CI (se viável).
- **Fase 11 – Auditoria final (adversarial).** Clone limpo, npm ci, banco novo, migrar, seed, subir, npm test, npm run jornada; percorrer a matriz linha por linha; buscar TODO/any/console.log/rotas sem schema/serviços importando Fastify; revisar Swagger; corrigir tudo.

---

## 19. CRITÉRIO DE ACEITE E RELATÓRIO FINAL
Só declare concluído quando: todos os testes passam num clone limpo (mostre a saída), a jornada roda sem falhas, a matriz de rastreabilidade está 100% preenchida, os 6 documentos existem, o README permite que uma pessoa sem contexto rode o projeto, e `docs/PENDENCIAS.md` lista com honestidade tudo que não foi cumprido ou foi assumido.

Relatório final (máximo 40 linhas): comandos para executar o projeto do zero; resultado real dos testes e da cobertura; lista de decisões que o autor precisa saber explicar ao professor; pendências; o que foi verificado em cada sistema operacional e o que não foi.
