# DECISÕES ARQUITETURAIS — greencode

> Formato: **Contexto → Decisão → Alternativas rejeitadas → Consequências**

---

## D-C1 — Hash de Senha: bcryptjs vs SHA-256

**Contexto:** A AV1 especificou SHA-256 para hash de senhas. A AV2 menciona bcrypt. São incompatíveis entre si.

**Decisão:** Usar **bcryptjs** (pacote JavaScript puro, sem compilação nativa). Custo (salt rounds) configurável via variável de ambiente `BCRYPT_ROUNDS`, padrão `12`.

**Alternativas rejeitadas:**
- SHA-256: algoritmo de propósito geral, extremamente rápido, sem salt embutido, sem custo adaptativo. Vulnerável a ataques de força bruta e tabelas rainbow. Não adequado para hash de senhas.
- `bcrypt` nativo (node-bcrypt): requer compilação nativa com node-gyp, causando problemas em Windows e ambientes sem build tools.
- argon2: excelente para segurança, mas requer compilação nativa. Fora de escopo.

**Consequências:** Senhas protegidas com custo adaptativo (cada aumento de 1 em rounds dobra o tempo de hash). Com rounds=12, ~300ms por hash em hardware médio, adequado para produção. Funciona igual em Windows e Ubuntu sem dependências nativas.

---

## D-C2 — Fim do AES-256: arquivos criptografados

**Contexto:** A AV1 usava arquivos criptografados com AES-256 como mecanismo de persistência. Na AV2, os dados migram para PostgreSQL; não há mais arquivos de dados.

**Decisão:** Remover completamente o AES-256. A proteção dos dados passa a ser provida por:
1. Credenciais do banco somente via variáveis de ambiente (nunca no código ou no repositório)
2. Acesso de rede ao banco restrito à rede interna do Docker
3. Disco criptografado no servidor de produção (responsabilidade da infraestrutura)
4. Segredos gerenciados fora do repositório (`.env` no `.gitignore`)

**Alternativas rejeitadas:**
- Criptografia de campos sensíveis no banco: complexidade alta, não exigida pela especificação, aumentaria risco de bugs.
- Manter AES-256 para compatibilidade: não há arquivos de dados para criptografar.

**Consequências:** Superfície de ataque muda de "acesso aos arquivos" para "acesso ao banco". A proteção é equivalente ou superior com boas práticas de infraestrutura. Documentado em SEGURANCA.md.

---

## D-C3 — Provisionamento do primeiro admin

**Contexto:** A AV1 usava "modo de provisionamento" quando o arquivo mestre não existia. Na AV2, não há arquivo mestre.

**Decisão:** O sistema nunca cria um admin com senha padrão. O provisionamento é feito via `npm run criar-admin`, script interativo (lê `ADMIN_EMAIL` e `ADMIN_SENHA` do ambiente ou prompt). O servidor sobe normalmente sem admin; o script cria o primeiro.

**Alternativas rejeitadas:**
- Admin padrão embutido no seed: cria vetor de ataque com credenciais conhecidas em produção.
- Modo de provisionamento no servidor: aumenta complexidade do servidor e cria endpoint sem autenticação.

**Consequências:** Operação segura, mas requer execução manual do script antes do primeiro uso. Documentado no README.

---

## D-C4 — Sessão por inatividade: JWT stateless

**Contexto:** A AV1 expira sessões por inatividade (30min sem ação). JWT é stateless e não tem como detectar inatividade real.

**Decisão:** JWT com expiração fixa por tempo (`JWT_EXPIRA_EM`, padrão `30m`). O endpoint `POST /auth/renovar` emite novo token a partir de um token ainda válido, simulando a renovação por atividade. A limitação (não é possível revogar um token antes de expirar) está documentada em SEGURANCA.md.

**Alternativas rejeitadas:**
- Sessões com estado no Redis: exige infraestrutura adicional, fora de escopo.
- Token blacklist em memória: não escala, perde ao reiniciar o servidor.
- Refresh tokens com rotação: mais complexo, fora do escopo da AV2.

**Consequências:** Token roubado permanece válido até expirar. Mitigado por HTTPS (em produção), expiração curta e helmet headers.

---

## D-C5 — UML ausente: nomes são suposições

**Contexto:** O diagrama UML da AV1 não foi fornecido. Os nomes de classes, enums e campos foram especificados no prompt mestre.

**Decisão:** Adotar os nomes exatamente como especificados no prompt. Registrar tudo como "suposição baseada na especificação textual". Produzir o UML Mermaid do que foi realmente implementado em docs/ARQUITETURA.md.

**Alternativas rejeitadas:** Nenhuma — sem o UML original, a especificação textual é a única fonte.

**Consequências:** Os nomes podem diferir do diagrama original da AV1. Registrado em PENDENCIAS.md como item a confirmar com o professor.

---

## D-C6 — Contrato opcional para criar lote

**Contexto:** A AV2 define que a organização tem contrato opcional. A especificação não é explícita sobre exigir contrato para criar lote.

**Decisão:** Não exigir contrato vigente para criar lote. O contrato é um relacionamento opcional e independente da operação logística.

**Alternativas rejeitadas:** Exigir contrato: mais restritivo, mas pode inviabilizar cenários legítimos (ex.: lote experimental antes de assinar contrato).

**Consequências:** Organizações podem receber lotes sem contrato. Registrado em PENDENCIAS.md para confirmar com professor.

---

## D-C7 — ADMIN com todos os privilégios

**Contexto:** A AV1 define "um único usuário com privilégios elevados". A especificação pede segregação de responsabilidades entre 4 papéis.

**Decisão:** ADMIN pode executar todas as operações de todos os papéis, além de gerenciar usuários e parâmetros (exclusivos do ADMIN).

**Alternativas rejeitadas:** ADMIN somente como papel administrativo sem acesso a operações de outros papéis: aumentaria fricção sem ganho de segurança neste contexto.

**Consequências:** Simplicidade operacional. O ADMIN tem acesso total; confiar em auditoria para rastreabilidade de ações.

---

## D-C8 — Versionamento em modelos imutáveis

**Contexto:** A AV2 exige versionamento otimista (campo `versao`) em todo update. `Movimentacao` e `Auditoria` são append-only (nunca sofrem update).

**Decisão:**
- `Movimentacao`: recebe `versao = 1` na criação (constante, por conformidade literal com A2-14). Nunca é incrementado.
- `Auditoria`: não recebe campo `versao`. Justificativa: é puramente append-only por design e protegida por trigger que impede UPDATE/DELETE. O campo seria inútil e enganoso.

**Alternativas rejeitadas:** Não ter `versao` em `Movimentacao`: viola a letra do requisito A2-14 explicitamente.

**Consequências:** Código de `versao` em `Movimentacao` é constante; desenvolvedores futuros precisam entender o motivo (documentado aqui).

---

## D-C9 — Validação: JSON Schema com TypeBox

**Contexto:** A AV2 exige JSON Schema (diferencial do Fastify). A especificação sugere `@fastify/type-provider-typebox`.

**Decisão:** Usar `@sinclair/typebox` com `@fastify/type-provider-typebox`. Gera JSON Schema válido E tipos TypeScript simultaneamente, sem duplicação. Não misturar com Zod nas rotas.

**Alternativas rejeitadas:**
- JSON Schema manual: verboso, sem tipos TypeScript automáticos.
- Zod: excelente, mas não gera JSON Schema nativo para o Fastify sem bridge.
- fluent-json-schema: menos popular, menor ecossistema de tipos.

**Consequências:** Rotas tipadas end-to-end. Validação acontece no Fastify antes de chegar ao controller. Verificar compatibilidade de versões antes de instalar (protocolo anti-alucinação).

---

## D-01 — Monólito vs Microsserviços

**Contexto:** A AV2 exige monólito. A startup está no estágio inicial, domínio em evolução.

**Decisão:** Monólito modular com separação clara por módulos (pasta `src/modules/`) e interfaces de repositório. Facilita evolução futura para microsserviços sem reescrever a lógica de domínio.

**Alternativas rejeitadas:** Microsserviços desde o início: overhead operacional enorme, complexidade desnecessária para equipe pequena.

**Consequências:** Ver seção "Limites do monólito" ao final deste documento.

---

## D-02 — Fastify vs Express

**Contexto:** A AV2 menciona Fastify como preferido.

**Decisão:** Fastify. Validação nativa por JSON Schema, performance superior, plugins oficiais robustos, suporte TypeScript excelente.

**Alternativas rejeitadas:** Express: sem validação nativa, mais lento, ecossistema fragmentado para TypeScript.

**Consequências:** Curva de aprendizado para quem vem do Express. Configuração de plugins mais opinada.

---

## D-03 — Prisma vs SQL puro

**Contexto:** A AV2 exige Prisma ORM.

**Decisão:** Prisma ORM com PostgreSQL. Migrações versionadas, type safety, `$transaction` interativa.

**Alternativas rejeitadas:** SQL puro (pg): mais controle, mas sem migrations versionadas nativas, sem geração de tipos, mais código boilerplate.

**Consequências:** Prisma v7+ tem configuração diferente (arquivo `prisma.config.ts`). Verificar versão instalada antes de configurar (protocolo anti-alucinação).

---

## D-04 — PostgreSQL vs MySQL/SQLite

**Contexto:** A AV2 exige PostgreSQL.

**Decisão:** PostgreSQL 16 (versão fixa no docker-compose). Suporte robusto a: `uuid_generate_v4()`, SEQUENCE para códigos de barras, triggers complexos com variáveis de sessão, Decimal nativo.

**Alternativas rejeitadas:**
- MySQL: triggers com variáveis de sessão mais limitados, menos suporte a tipos avançados.
- SQLite: sem suporte a triggers com variáveis de sessão, não adequado para produção.

**Consequências:** Requer Docker ou PostgreSQL instalado. Documentado como pré-requisito no README.

---

## D-05 — JWT vs Sessão com estado

**Contexto:** A AV2 exige JWT.

**Decisão:** JWT stateless com `@fastify/jwt`. Token contém `{ sub: userId, papel }`. Ver D-C4 para limitações.

**Alternativas rejeitadas:** Sessão com Redis: infraestrutura adicional, não exigida.

**Consequências:** Sem revogação imediata. Documentado em SEGURANCA.md.

---

## D-06 — Versionamento otimista vs Lock pessimista

**Contexto:** A AV2 exige versionamento otimista.

**Decisão:** Campo `versao` em todos os modelos mutáveis. Todos os updates usam `updateMany({ where: { id, versao } })`. Count = 0 → verificar 404 vs 409.

**Alternativas rejeitadas:** Lock pessimista (`SELECT FOR UPDATE`): impede leituras durante updates, degrada performance, não exigido.

**Consequências:** Conflitos retornam 409. Cliente deve recarregar e tentar novamente.

---

## D-07 — Auditoria com trigger vs arquivo

**Contexto:** A AV1 usava arquivo de journal. A AV2 usa banco de dados.

**Decisão:** Tabela `Auditoria` no PostgreSQL, protegida por trigger que bloqueia UPDATE e DELETE (exceto com variável de sessão `greencode.limpeza = 'on'` e registro > 180 dias). Registros gravados na mesma transação dos dados.

**Alternativas rejeitadas:**
- Arquivo de log como journal: sem transacionalidade, pode dessincronizar do banco.
- Tabela sem trigger: depende de disciplina do código para imutabilidade.

**Consequências:** Imutabilidade garantida pelo banco. Limitação: quem tem acesso direto ao banco pode definir a variável de sessão. Documentado em SEGURANCA.md.

---

## D-08 — Rotação de log (pino-roll)

**Contexto:** A especificação exige rotação de logs ao atingir 10 MB.

**Decisão:** Usar `pino-roll` com configuração de `size`. Verificar na documentação da versão instalada que o parâmetro `size` é suportado.

**Alternativas rejeitadas:** `pino-rotating-file-stream`: menos mantido. `winston`: troca o logger completo, fora de escopo.

**Consequências:** Log rotacionado automaticamente. Arquivos antigos retidos conforme configuração.

---

## D-09 — Decimal vs float para valores monetários

**Contexto:** A especificação exige Decimal para valores monetários.

**Decisão:** Tipo `Decimal` do Prisma (mapeia para `NUMERIC` no PostgreSQL). Aritmética com a biblioteca `decimal.js` (incluída no Prisma). Arredondamento a 2 casas com `ROUND_HALF_UP`.

**Alternativas rejeitadas:** `float`/`number` do JavaScript: perde precisão em aritmética decimal (ex.: 0.1 + 0.2 ≠ 0.3).

**Consequências:** Valores financeiros precisos. Serialização para JSON como string (comportamento padrão do Prisma com Decimal).

---

## D-10 — CNPJ alfanumérico (2026)

**Contexto:** A partir de 2026, a Receita Federal passou a emitir CNPJs com letras (A-Z) nas 12 primeiras posições. O algoritmo de validação usa `ASCII - 48` para converter caracteres em valores numéricos, mantendo o Módulo 11. Os dois dígitos verificadores (posições 13 e 14) permanecem numéricos. Fonte: SERPRO / Instrução Normativa RFB nº 2.229/2024 — **confirmado por pesquisa** (protocolo anti-alucinação cumprido).

**Decisão:** O `ValidadorCnpj` aceita CNPJ alfanumérico (letras maiúsculas A-Z e dígitos 0-9 nas posições 1-12, apenas dígitos nas posições 13-14). O algoritmo usa `charCodeAt(0) - 48` para todos os caracteres. CNPJ normalizado: remover pontuação (`.`, `/`, `-`), converter para maiúsculas, exigir 14 caracteres.

**Alternativas rejeitadas:** Aceitar apenas numérico: sistema estaria desatualizado em relação à legislação vigente em 2026.

**Consequências:** Validador mais abrangente, compatível com CNPJs emitidos a partir de julho de 2026. Regex de validação atualizado para `/^[A-Z0-9]{12}\d{2}$/`.

---

## D-11 — Fórmula de cálculo financeiro (R8) — SUPOSIÇÃO

**Contexto:** A especificação define a fórmula: `valorResidual = valorAquisicao × (1 − coeficienteDepreciação(tipo))` e `imposto = valorResidual × alíquota`. A especificação instrui registrar como **suposição**.

**Decisão:** Implementar exatamente a fórmula descrita. Arredondamento a 2 casas decimais usando `ROUND_HALF_UP`. Coeficiente de depreciação lido do `Parametro` com chave `COEF_DEPRECIACAO_<TIPO>`.

**Alternativas rejeitadas:** Nenhuma — a especificação é a fonte.

**Consequências:** A fórmula pode não corresponder à regra fiscal real. Confirmação com professor necessária (ver PENDENCIAS.md P5).

---

## D-12 — Docker Compose como orquestrador de desenvolvimento

**Contexto:** `psql` não está no PATH do Windows. A especificação exige PostgreSQL.

**Decisão:** Docker Compose com PostgreSQL 16 (versão fixa). Healthcheck configurado. Credenciais via `.env`. Banco de dados e banco de testes em serviços separados ou no mesmo PostgreSQL com schemas/databases diferentes.

**Alternativas rejeitadas:** PostgreSQL instalado nativamente: aumenta barreira de entrada, não portável.

**Consequências:** Requer Docker Desktop no Windows. Documentado no README.

---

## D-13 — Autorização em duas camadas

**Contexto:** A AV2 exige que os services validem o papel recebido (defesa em profundidade).

**Decisão:** Duas camadas:
1. Hook do Fastify (`exigirPapel([...])`) — verifica o papel antes do controller processar.
2. Service — verifica o papel no início de cada operação sensível.

**Alternativas rejeitadas:** Apenas no hook: uma vez que o service é testado sem HTTP (testes unitários), precisa validar por conta própria.

**Consequências:** Código de autorização duplicado em dois lugares. Preferível à ausência de defesa em profundidade.

---

## D-14 — Imutabilidade de Auditoria sem campo `versao`

**Contexto:** C8 define que `Auditoria` não recebe campo `versao`.

**Decisão:** `Auditoria` é append-only, protegida por trigger de banco. Não faz sentido ter `versao` se o registro nunca é atualizado. O trigger é a garantia de imutabilidade.

**Alternativas rejeitadas:** Adicionar `versao = 1` como em `Movimentacao`: seria cargo cult sem utilidade funcional.

**Consequências:** Código mais limpo. Imutabilidade garantida pelo banco, não pela aplicação.

---

## D-15 — Verificações por SO

**Contexto:** A especificação exige registrar quais verificações foram executadas em cada SO.

**Verificações no Windows 10/11 (ambiente de desenvolvimento — executado e comprovado):**
- ✅ Node.js v22.14.0
- ✅ npm 10.9.2
- ✅ Docker 29.5.3 e Docker Compose v5.1.4 (`greencode_db` na 5432 e `greencode_db_test` na 5433)
- ✅ git 2.49.0
- ✅ `npx prisma validate` e `npx prisma migrate deploy` (3 migrações aplicadas em banco vazio)
- ✅ `npm run typecheck`, `npm run lint` e `npm run test:coverage` (16 suítes de testes unitários e de integração passando)
- ✅ `npm run db:seed` executado duas vezes seguidas (idempotência verificada)
- ✅ `npm run jornada` executado contra o servidor HTTP real em execução (15/15 passos verificados)
- ✅ Graceful shutdown com `SIGINT` verificado via processo filho (teste de `SIGTERM` nativo marcado como `skipIf(win32)` com justificativa técnica)

**Verificações no Ubuntu 24.04:**
- ⚠️ Configurado no workflow `.github/workflows/ci.yml` (PostgreSQL 16 como service container, migrações, seed e suíte completa de testes), mas **não executado localmente** pois a máquina de desenvolvimento é Windows.

---

## D-16 — O banco é a rede de segurança; as regras exatas ficam no service

**Contexto:** Algumas regras dependem de fuso e de regra de negócio (R2: data do lote, com `TZ_NEGOCIO`). `CURRENT_DATE` do PostgreSQL usa o fuso do servidor (UTC), e entre 21h e 24h em America/Sao_Paulo o banco já está no dia seguinte.

**Decisão:** O CHECK do Lote é `data_entrada <= CURRENT_DATE + 1` (tolerância de um dia). Ele só impede datas absurdas. A regra exata (não futura, máximo 90 dias, no fuso de negócio, via `Relogio`) fica no service/`ValidadorLote`. O mesmo vale para os demais CHECKs, que duplicam as regras R3 (desmonte exige triagem), R4 (justificativa em queda de 2 níveis), R10 (movimentação precisa mudar algo) e o formato do CNPJ (`^[A-Z0-9]{12}[0-9]{2}$`; dígitos verificadores só no service).

**Alternativas rejeitadas:** `CURRENT_DATE` sem tolerância (rejeitaria lotes legítimos no fim da noite); `(NOW() AT TIME ZONE 'America/Sao_Paulo')::date` (acoplaria o schema ao fuso e duplicaria `TZ_NEGOCIO`, que é configurável por env).

**Consequências:** Duas camadas de defesa. O service devolve a mensagem de negócio (422); se um bug do service deixar passar, o banco recusa o dado inconsistente.

---

## D-17 — Bug do trigger de Auditoria (`NULL <> 'on'`) e correção com COALESCE

**Contexto:** Na primeira bateria de testes manuais, `DELETE` sem a variável `greencode.limpeza` apagou um registro de 181 dias. `current_setting('greencode.limpeza', true)` devolve `NULL` quando a variável nunca foi definida na sessão, e `NULL <> 'on'` resulta em `NULL`, não `TRUE`; o `IF` não disparou e o `DELETE` passou. Só a checagem de 180 dias foi aplicada.

**Decisão:** `limpeza_ativa := COALESCE(current_setting('greencode.limpeza', true), '')`. O banco foi recriado e o teste repetido: DELETE sem variável é bloqueado; com `SET LOCAL ... = 'on'` bloqueia registros com 179 dias e permite os de 181.

**Alternativas rejeitadas:** capturar `undefined_object` em um bloco `EXCEPTION` (o `current_setting` com `missing_ok = true` não lança esse erro, então o tratamento nunca executava).

**Consequências:** O teste automatizado da Fase 10 deve cobrir o caso "variável nunca definida", além de "off" e "on". Limitação conhecida: quem tem acesso ao banco pode executar `SET LOCAL greencode.limpeza = 'on'`. A alternativa mais forte é uma role de banco separada, com permissão de DELETE somente para o job de retenção (registrada em SEGURANCA.md).

---

## D-18 — Movimentação imutável e escolhas de modelagem do schema

**Contexto:** `Movimentacao` é histórico append-only (C8).

**Decisão:**
- Trigger bloqueia UPDATE e DELETE em `movimentacoes`, sem exceção. TRUNCATE não é bloqueado de propósito, para a limpeza entre testes (`TRUNCATE ... CASCADE`); em produção, a role da aplicação não deve ter esse privilégio.
- A R4 também existe como CHECK (`fn_estado_fisico_valor`, função IMMUTABLE que mapeia o enum para 0..4), exigindo justificativa com 10+ caracteres em queda de 2 ou mais níveis.
- Chaves primárias e estrangeiras usam `@db.Uuid` (tipo nativo, 16 bytes, validado pelo banco). `Auditoria.entidadeId` é `String` porque pode apontar para chaves não UUID (ex.: `Parametro.chave`).
- `Auditoria.antes`/`depois` são opcionais: uma criação não tem estado "antes".
- Todas as relações têm `onDelete: Restrict` explícito, inclusive a opcional de Auditoria: nada de negócio é apagado em cascata.
- `Equipamento.status` tem `@default(RECEBIDO)`; `senhaHash` é mapeado para `senha_hash`.

**Alternativas rejeitadas:** `ON DELETE CASCADE` (apagaria histórico auditável); `SET NULL` na Auditoria (apagaria o autor do registro); `TEXT` para UUID (aceita lixo).

**Consequências:** O banco recusa dados fora de padrão (ids malformados, histórico alterado). Os testes e o seed precisam gerar UUIDs válidos e a limpeza de testes precisa de TRUNCATE.

---

## D-19 — Status HTTP 422 para regras de domínio (incluindo CNPJ inválido) vs 400 para schema

**Contexto:** Na validação de entrada, um erro pode ser sintático (tipo errado, campo obrigatório ausente no JSON Schema do Fastify) ou semântico/de negócio (CNPJ com dígitos verificadores inválidos, sequência repetida, transição de status proibida, lote fora da janela de 90 dias).

**Decisão:** O schema TypeBox da rota valida tipos básicos (`string`, `minLength: 1`), permitindo que o `Service` normalize o CNPJ e aplique o `ValidadorCnpj`, lançando `ErroRegraDeNegocio` mapeado para **422 Unprocessable Entity** (`severidade: AVISO`). Violação estrutural do JSON Schema retorna **400 Bad Request** (`VALIDACAO_INVALIDA`).

**Alternativas rejeitadas:** Validar regex estrito de CNPJ no JSON Schema da rota (retornaria 400 genérico sem distinguir dígitos repetidos ou erro de dígito verificador com mensagem de negócio clara).

**Consequências:** Clientes recebem `422 CNPJ_INVALIDO` com detalhes por campo quando o CNPJ é inválido e `400 VALIDACAO_INVALIDA` quando o payload JSON está malformado.

---

## D-20 — Criação de lote com ou sem equipamentos iniciais

**Contexto:** Um lote pode chegar ao almoxarifado com a lista completa de equipamentos já conhecida na nota fiscal (`POST /api/v1/lotes` com `equipamentos[]`) ou ter equipamentos cadastrados individualmente à medida que o caminhão é descarregado (`POST /api/v1/equipamentos`).

**Decisão:** `POST /api/v1/lotes` aceita `equipamentos` opcional (ou lista vazia) e cria todos os equipamentos informados na mesma `$transaction` atômica. Caso qualquer equipamento da lista seja inválido, nenhum equipamento nem o lote são persistidos. Equipamentos adicionais podem ser cadastrados via `POST /api/v1/equipamentos` informando `loteId`.

**Alternativas rejeitadas:** Exigir obrigatoriamente ao menos 1 equipamento no `POST /lotes` (impediria criar o lote antes de bipar equipamentos avulsos em `POST /equipamentos`).

**Consequências:** Flexibilidade operacional preservando a atomicidade exigida em R7 e A2-13.

---

## D-21 — Formato `GC-000001` e imutabilidade do código de barras interno (R6)

**Contexto:** Cada equipamento precisa de um identificador físico único e imutável no formato `GC-` + sequencial com zeros à esquerda.

**Decisão:** Formato padronizado `^GC-\d{6,}$` (ex.: `GC-000001`), gerado via `SELECT nextval('seq_codigo_barras')` no PostgreSQL quando não enviado pelo cliente. Além do índice `UNIQUE`, a 3ª migração (`20261022000002_codigo_barras_imutavel`) criou o trigger `trg_equipamentos_codigo_barras_imutavel` que bloqueia qualquer tentativa de `UPDATE` em `codigo_barras_interno`.

**Alternativas rejeitadas:** Incluir o ano no código (`GC-2026-000001`) ou gerar código via `MAX(id) + 1` em aplicação (vulnerável a condição de corrida sob concorrência).

**Consequências:** Geração segura contra concorrência e imutabilidade garantida no próprio SGBD.

---

## D-22 — Limpeza do banco de testes com `session_replication_role = replica`

**Contexto:** Os triggers de imutabilidade bloqueiam `DELETE` (em `movimentacoes` e em `auditorias` com menos de 180 dias) e `TRUNCATE` (em `auditorias`), o que impediria isolar cada teste de integração.

**Decisão:** O helper `limparBanco()` (`tests/helpers/banco.ts`) verifica obrigatoriamente que `DATABASE_URL` aponta para um banco `_test`, abre uma transação e executa `SET LOCAL session_replication_role = replica` antes do `TRUNCATE TABLE ... RESTART IDENTITY CASCADE` e `ALTER SEQUENCE seq_codigo_barras RESTART WITH 1`.

**Alternativas rejeitadas:** Recriar o banco de dados inteiro com `migrate reset` antes de cada teste (tornaria a suíte dezenas de vezes mais lenta).

**Consequências:** Limpeza rápida (~15ms por teste) e segura, restrita exclusivamente ao banco `_test`.

---

## Limites do monólito: quando eu dividiria?

O greencode foi construído como monólito modular com interfaces de repositório bem definidas. Esta arquitetura permite evoluir para microsserviços quando:

1. **Escala independente de módulos:** O módulo de rastreabilidade pode ter 100x mais leituras que o módulo de usuários. Separar em serviços permite escalar apenas o necessário.

2. **Times grandes:** Com mais de 5-6 desenvolvedores trabalhando simultaneamente, conflitos de merge e deploys acoplados se tornam gargalo. Módulos separados = autonomia de times.

3. **Deploy independente:** Hoje, um bug no relatório financeiro requer redeployment de todo o sistema. Com microsserviços, apenas o serviço de relatórios seria atualizado.

4. **Isolamento de falhas:** Uma falha no serviço de auditoria não derrubaria o serviço de triagem.

**Exemplos concretos neste domínio:**
- Serviço de rastreabilidade: alta leitura, baixa escrita, ótimo candidato a cache e CDN.
- Serviço de relatórios financeiros: pode rodar em batch, não precisa de latência baixa.
- Serviço de auditoria: append-only, ótimo candidato a Kafka/EventSourcing.

**Caminho de evolução:**
Os módulos já estão isolados por pasta (`src/modules/`) e por interface de repositório. Para extrair um serviço:
1. Extrair o módulo + interface de repositório para repositório separado.
2. Substituir chamadas diretas por HTTP/gRPC/mensageria.
3. Manter contrato de API compatível (versionamento já em `/api/v1`).

O custo de evolução é real, mas menor do que em um monólito onde a lógica de negócio está acoplada ao framework HTTP.
