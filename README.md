# greencode — Logística Reversa de Resíduos Eletrônicos (AV1 + AV2)

API RESTful monolítica construída com **Node.js (>= 22)**, **TypeScript strict**, **Fastify 5**, **Prisma 6** e **PostgreSQL 16** para rastreamento ponta a ponta de resíduos eletrônicos (e-waste) desde a organização geradora até a destinação ambientalmente adequada, em conformidade com a Política Nacional de Resíduos Sólidos.

---

## Sumário

1. [Pré-requisitos](#1-pré-requisitos)
2. [Instalação do Node.js 22 LTS](#2-instalação-do-nodejs-22-lts)
3. [Instalação Passo a Passo — Windows 10/11 (PowerShell)](#3-instalação-passo-a-passo--windows-1011-powershell)
4. [Instalação Passo a Passo — Ubuntu 24.04 LTS](#4-instalação-passo-a-passo--ubuntu-2404-lts)
5. [Alternativa com PostgreSQL já Instalado (sem Docker)](#5-alternativa-com-postgresql-já-instalado-sem-docker)
6. [Variáveis de Ambiente (`.env`)](#6-variáveis-de-ambiente-env)
7. [Usuários de Desenvolvimento (Seed)](#7-usuários-de-desenvolvimento-seed)
8. [Comandos Disponíveis (`package.json`)](#8-comandos-disponíveis-packagejson)
9. [Documentação Interativa (Swagger / OpenAPI)](#9-documentação-interativa-swagger--openapi)
10. [Solução de Problemas Comuns](#10-solução-de-problemas-comuns)

---

## 1. Pré-requisitos

- **Node.js:** `>= 22.0.0` (LTS atual; definido em `.nvmrc` e `package.json#engines`)
- **npm:** `>= 10.0.0`
- **Banco de Dados:** Docker Desktop / Docker Engine com Docker Compose v2 **ou** instância local do PostgreSQL 16+
- **Git:** `>= 2.30`

---

## 2. Instalação do Node.js 22 LTS

O repositório oficial `apt` do Ubuntu 24.04 traz uma versão anterior do Node.js. Utilize o **nvm** (Linux/macOS) ou **nvm-windows / instalador oficial** (Windows):

### No Ubuntu 24.04 (via `nvm`)

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22
node --version   # Deve exibir v22.x.x
npm --version    # Deve exibir 10.x.x
```

### No Windows 10/11 (via `winget` ou `nvm-windows`)

```powershell
# Opção A: Instalador oficial LTS via winget
winget install OpenJS.NodeJS.LTS

# Opção B: caso utilize nvm-windows
nvm install 22
nvm use 22

node --version   # Deve exibir v22.x.x
npm --version    # Deve exibir 10.x.x
```

---

## 3. Instalação Passo a Passo — Windows 10/11 (PowerShell)

Execute os comandos abaixo no PowerShell dentro da pasta `greencode`:

```powershell
# 1. Instalar dependências
npm install

# 2. Criar arquivo .env a partir do modelo
Copy-Item .env.example .env

# 3. Subir os containers PostgreSQL (desenvolvimento na porta 5432 e teste na porta 5433)
docker compose up -d

# 4. Confirmar que os containers estão healthy
docker compose ps

# 5. Aplicar as migrações versionadas (tabelas, CHECKs, SEQUENCE e triggers) no banco de desenvolvimento
npm run db:migrate

# 6. Popular banco com massa de dados idempotente de desenvolvimento
npm run db:seed

# 7. Preparar o banco de testes (porta 5433) e rodar toda a suíte automatizada
npm run test:db:preparar
npm test

# 8. Subir o servidor em modo de desenvolvimento
npm run dev
```

Em outro terminal PowerShell (com `npm run dev` rodando):

```powershell
# Executar a jornada completa ponta a ponta contra o servidor HTTP real
npm run jornada
```

---

## 4. Instalação Passo a Passo — Ubuntu 24.04 LTS

```bash
# 1. Instalar dependências
npm install

# 2. Criar arquivo .env a partir do modelo
cp .env.example .env

# 3. Subir os containers PostgreSQL (portas 5432 e 5433)
docker compose up -d

# 4. Aplicar migrações e popular o seed
npm run db:migrate
npm run db:seed

# 5. Preparar o banco de testes e executar typecheck, lint e testes com cobertura
npm run test:db:preparar
npm run typecheck
npm run lint
npm run test:coverage

# 6. Iniciar o servidor
npm run dev
```

Em outro terminal:

```bash
npm run jornada
```

---

## 5. Alternativa com PostgreSQL já Instalado (sem Docker)

Se você já possui o **PostgreSQL 16+** instalado localmente sem Docker:

1. Crie dois bancos de dados (`greencode` para desenvolvimento e `greencode_test` para testes):

```sql
CREATE USER greencode WITH PASSWORD 'greencode' SUPERUSER;
CREATE DATABASE greencode OWNER greencode;
CREATE DATABASE greencode_test OWNER greencode;
```

2. Ajuste as variáveis `DATABASE_URL` e `DATABASE_URL_TEST` no seu arquivo `.env` apontando para a porta local (ex.: `5432`):

```dotenv
DATABASE_URL="postgresql://greencode:greencode@localhost:5432/greencode?schema=public"
DATABASE_URL_TEST="postgresql://greencode:greencode@localhost:5432/greencode_test?schema=public"
```

3. Em seguida, rode normalmente:

```bash
npm run db:migrate
npm run db:seed
npm run test:db:preparar
npm test
```

---

## 6. Variáveis de Ambiente (`.env`)

Todas as variáveis são validadas na inicialização (`src/config/env.ts`). Caso alguma variável obrigatória esteja ausente ou inválida, o servidor falha imediatamente listando os campos faltantes.

| Variável | Obrigatória | Padrão | Descrição |
|---|---|---|---|
| `DATABASE_URL` | Sim | — | URL de conexão do PostgreSQL principal |
| `DATABASE_URL_TEST` | Em testes | — | URL do banco de testes (deve conter `_test`) |
| `JWT_SECRET` | Sim | — | Segredo de assinatura JWT (**mínimo 32 caracteres**) |
| `JWT_EXPIRA_EM` | Não | `30m` | Tempo de expiração do token JWT (`C4` / `A1-07`) |
| `BCRYPT_ROUNDS` | Não | `12` | Custo (salt rounds) do hash `bcryptjs` (`C1` / `A1-06`) |
| `PORT` | Não | `3000` | Porta HTTP do servidor (`A2-04`) |
| `HOST` | Não | `0.0.0.0` | Endereço de bind do servidor |
| `NODE_ENV` | Não | `development` | Ambiente (`development`, `test`, `production`) |
| `TZ_NEGOCIO` | Não | `America/Sao_Paulo` | Fuso horário de negócio para validação de datas de lote (`R2`) |
| `CORS_ORIGENS` | Não | `""` | Lista de origens permitidas separadas por vírgula (vazio bloqueia origens externas) |
| `LOG_LEVEL` | Não | `info` | Nível do logger Pino (`debug`, `info`, `warn`, `error`, `fatal`, `silent`) |
| `LOG_MAX_SIZE` | Não | `10m` | Tamanho máximo de cada arquivo de log antes da rotação (`A1-17`) |
| `AUDITORIA_RETENCAO_DIAS` | Não | `180` | Dias de retenção no comando `limpar-auditoria` (**mínimo 180**) |
| `SHUTDOWN_TIMEOUT_MS` | Não | `10000` | Timeout máximo em ms para aguardar requisições no graceful shutdown |

---

## 7. Usuários de Desenvolvimento (Seed)

Ao rodar `npm run db:seed` (que **recusa** execução se `NODE_ENV=production`), são criados 4 usuários (um para cada papel da matriz RBAC):

| Papel | E-mail | Senha de Desenvolvimento | Permissões Principais |
|---|---|---|---|
| `ADMIN` | `admin@greencode.com.br` | `AdminSeed123` | Acesso total, `/usuarios`, `/parametros`, relatórios e auditoria |
| `OPERADOR_CADASTRO` | `operador@greencode.com.br` | `OperadorSeed123` | Leitura e escrita em `/organizacoes` e `/contrato`; leitura logística |
| `GESTOR_ALMOXARIFADO` | `gestor@greencode.com.br` | `GestorSeed123` | Leitura e escrita em `/lotes`, `/equipamentos`, `/triagem`, `/movimentacoes` |
| `AUDITOR` | `auditor@greencode.com.br` | `AuditorSeed123` | Somente leitura em tudo + acesso a `/relatorios/*` e `/auditoria` |

Para provisionar um administrador manualmente em banco limpo (sem usar o seed):

```bash
# Via variáveis de ambiente ou prompt interativo
npm run criar-admin
```

---

## 8. Comandos Disponíveis (`package.json`)

| Comando | Descrição |
|---|---|
| `npm run dev` | Inicia o servidor em desenvolvimento com hot-reload (`tsx watch`) |
| `npm run build` | Compila TypeScript para `dist/` com `tsc` |
| `npm start` | Executa a versão compilada (`node dist/server.js`) |
| `npm run typecheck` | Verifica tipos TypeScript (código + testes) sem emitir arquivos |
| `npm run lint` | Executa análise estática com ESLint |
| `npm run test` | Executa toda a suíte de testes unitários e de integração (Vitest) |
| `npm run test:coverage` | Executa os testes e gera relatório de cobertura v8 |
| `npm run test:db:preparar` | Aplica as migrações no banco de testes (`DATABASE_URL_TEST`) |
| `npm run db:migrate` | Aplica migrações pendentes no banco principal (`prisma migrate deploy`) |
| `npm run db:seed` | Popula dados iniciais de forma idempotente (`upsert`) |
| `npm run criar-admin` | Provisiona o primeiro usuário `ADMIN` (`C3` / `A1-09`) |
| `npm run jornada` | Executa a jornada de ponta a ponta (15 passos) contra o servidor em execução |
| `npm run limpar-auditoria` | Remove registros de auditoria com mais de 180 dias usando exceção controlada |

---

## 9. Documentação Interativa (Swagger / OpenAPI)

Com o servidor em execução (`npm run dev`), acesse:

- **Swagger UI:** [http://localhost:3000/docs](http://localhost:3000/docs)
- **Especificação OpenAPI 3.0 (JSON):** [http://localhost:3000/docs/json](http://localhost:3000/docs/json)
- **Healthcheck:** [http://localhost:3000/saude](http://localhost:3000/saude)

---

## 10. Solução de Problemas Comuns

1. **Erro `Can't reach database server at localhost:5432` ou `localhost:5433`:**
   - Verifique se o Docker Desktop está aberto e se os containers estão no ar com `docker compose ps`. Caso não estejam, execute `docker compose up -d`.
2. **Erro de validação de ambiente na inicialização (`JWT_SECRET deve ter no mínimo 32 caracteres`):**
   - Confirme que o arquivo `.env` foi copiado de `.env.example` e possui `JWT_SECRET` com 32+ caracteres.
3. **Falha no banco de testes por schema desatualizado:**
   - Execute `npm run test:db:preparar` para aplicar todas as migrações SQL no banco `greencode_test` (porta `5433`).
4. **Erro `429 LIMITE_REQUISICOES` ao testar `/api/v1/auth/login` repetidamente:**
   - O endpoint de login possui proteção contra força bruta (máximo de 5 tentativas por minuto por IP). Aguarde 60 segundos.
