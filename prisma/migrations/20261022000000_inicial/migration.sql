-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('ADMIN', 'OPERADOR_CADASTRO', 'GESTOR_ALMOXARIFADO', 'AUDITOR');

-- CreateEnum
CREATE TYPE "EstadoFisico" AS ENUM ('SUCATA', 'RUIM', 'REGULAR', 'BOM', 'EXCELENTE');

-- CreateEnum
CREATE TYPE "StatusEquipamento" AS ENUM ('RECEBIDO', 'EM_TRIAGEM', 'TRIADO', 'EM_DESMONTE', 'DESMONTADO', 'DESTINADO');

-- CreateEnum
CREATE TYPE "TipoEquipamento" AS ENUM ('DESKTOP', 'NOTEBOOK', 'MONITOR', 'SERVIDOR', 'PERIFERICO', 'REDE', 'OUTRO');

-- CreateEnum
CREATE TYPE "ClassificacaoDestino" AS ENUM ('REUTILIZACAO', 'RECICLAGEM', 'DESCARTE_SEGURO');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "papel" "Papel" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parametros" (
    "chave" TEXT NOT NULL,
    "valor" DECIMAL(18,6) NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parametros_pkey" PRIMARY KEY ("chave")
);

-- CreateTable
CREATE TABLE "organizacoes" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "cnpj" VARCHAR(14) NOT NULL,
    "nome" TEXT NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contratos" (
    "id" TEXT NOT NULL,
    "organizacao_id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "clausulas" JSONB,
    "inicio" DATE NOT NULL,
    "fim" DATE,
    "versao" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "contratos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lotes" (
    "id" TEXT NOT NULL,
    "organizacao_id" TEXT NOT NULL,
    "nota_fiscal" TEXT NOT NULL,
    "transportadora" TEXT NOT NULL,
    "data_entrada" DATE NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipamentos" (
    "id" TEXT NOT NULL,
    "lote_id" TEXT NOT NULL,
    "codigo_barras_interno" TEXT NOT NULL,
    "tipo" "TipoEquipamento" NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor_aquisicao" DECIMAL(18,2),
    "estado_fisico" "EstadoFisico" NOT NULL,
    "status" "StatusEquipamento" NOT NULL,
    "triagem_completa" BOOLEAN NOT NULL DEFAULT false,
    "classificacao_destino" "ClassificacaoDestino",
    "versao" INTEGER NOT NULL DEFAULT 1,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimentacoes" (
    "id" TEXT NOT NULL,
    "equipamento_id" TEXT NOT NULL,
    "status_anterior" "StatusEquipamento" NOT NULL,
    "status_novo" "StatusEquipamento" NOT NULL,
    "estado_anterior" "EstadoFisico" NOT NULL,
    "estado_novo" "EstadoFisico" NOT NULL,
    "justificativa" TEXT,
    "usuario_id" TEXT NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimentacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditorias" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidade_id" TEXT NOT NULL,
    "antes" JSONB NOT NULL,
    "depois" JSONB NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditorias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "organizacoes_codigo_key" ON "organizacoes"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "organizacoes_cnpj_key" ON "organizacoes"("cnpj");

-- CreateIndex
CREATE INDEX "organizacoes_criado_em_idx" ON "organizacoes"("criado_em");

-- CreateIndex
CREATE UNIQUE INDEX "contratos_organizacao_id_key" ON "contratos"("organizacao_id");

-- CreateIndex
CREATE UNIQUE INDEX "contratos_numero_key" ON "contratos"("numero");

-- CreateIndex
CREATE INDEX "lotes_organizacao_id_idx" ON "lotes"("organizacao_id");

-- CreateIndex
CREATE INDEX "lotes_criado_em_idx" ON "lotes"("criado_em");

-- CreateIndex
CREATE UNIQUE INDEX "equipamentos_codigo_barras_interno_key" ON "equipamentos"("codigo_barras_interno");

-- CreateIndex
CREATE INDEX "equipamentos_lote_id_idx" ON "equipamentos"("lote_id");

-- CreateIndex
CREATE INDEX "equipamentos_status_idx" ON "equipamentos"("status");

-- CreateIndex
CREATE INDEX "equipamentos_criado_em_idx" ON "equipamentos"("criado_em");

-- CreateIndex
CREATE INDEX "movimentacoes_equipamento_id_idx" ON "movimentacoes"("equipamento_id");

-- CreateIndex
CREATE INDEX "movimentacoes_criado_em_idx" ON "movimentacoes"("criado_em");

-- CreateIndex
CREATE INDEX "auditorias_usuario_id_idx" ON "auditorias"("usuario_id");

-- CreateIndex
CREATE INDEX "auditorias_entidade_idx" ON "auditorias"("entidade");

-- CreateIndex
CREATE INDEX "auditorias_criado_em_idx" ON "auditorias"("criado_em");

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipamentos" ADD CONSTRAINT "equipamentos_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes" ADD CONSTRAINT "movimentacoes_equipamento_id_fkey" FOREIGN KEY ("equipamento_id") REFERENCES "equipamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes" ADD CONSTRAINT "movimentacoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditorias" ADD CONSTRAINT "auditorias_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
