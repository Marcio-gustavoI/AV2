-- ============================================================
-- Migração 2: constraints de integridade, sequence e triggers
-- Escrita à mão (criada para ser editada, conforme a AV2).
-- O banco é a REDE DE SEGURANÇA; as regras exatas (R1..R12) ficam nos services.
-- ============================================================

-- ---- SEQUENCE do código de barras (R6), segura contra concorrência ----
CREATE SEQUENCE IF NOT EXISTS seq_codigo_barras START 1 INCREMENT 1;

-- ---- CHECKs: Parametro ----
ALTER TABLE "parametros"
  ADD CONSTRAINT "chk_parametro_valor_nao_negativo"
  CHECK (valor >= 0);

-- ---- CHECKs: Organizacao ----
-- CNPJ normalizado: 12 caracteres alfanuméricos maiúsculos + 2 dígitos verificadores.
-- Os dígitos verificadores em si são validados no service (ValidadorCnpj, R1).
ALTER TABLE "organizacoes"
  ADD CONSTRAINT "chk_organizacao_cnpj_formato"
  CHECK (cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$');

-- ---- CHECKs: Contrato ----
ALTER TABLE "contratos"
  ADD CONSTRAINT "chk_contrato_fim_apos_inicio"
  CHECK (fim IS NULL OR fim >= inicio);

-- ---- CHECKs: Lote ----
-- Tolerância de 1 dia: CURRENT_DATE é a data do banco (UTC) e o negócio usa
-- TZ_NEGOCIO (America/Sao_Paulo); entre 21h e 24h locais o banco já está no dia seguinte.
-- A regra exata (não futura, máximo 90 dias, fuso de negócio) é a R2, no service.
ALTER TABLE "lotes"
  ADD CONSTRAINT "chk_lote_data_entrada_nao_futura"
  CHECK (data_entrada <= CURRENT_DATE + 1);

-- ---- CHECKs: Equipamento ----
ALTER TABLE "equipamentos"
  ADD CONSTRAINT "chk_equipamento_valor_aquisicao_nao_negativo"
  CHECK (valor_aquisicao IS NULL OR valor_aquisicao >= 0);

-- triagem_completa = true implica classificacao_destino preenchida
ALTER TABLE "equipamentos"
  ADD CONSTRAINT "chk_equipamento_triagem_classificacao"
  CHECK (triagem_completa = false OR classificacao_destino IS NOT NULL);

-- Rede de segurança da R3: desmonte e etapas seguintes exigem triagem completa
ALTER TABLE "equipamentos"
  ADD CONSTRAINT "chk_equipamento_desmonte_exige_triagem"
  CHECK (status NOT IN ('EM_DESMONTE', 'DESMONTADO', 'DESTINADO') OR triagem_completa = true);

-- ============================================================
-- Função auxiliar: ordem numérica do estado físico (SUCATA=0 .. EXCELENTE=4)
-- IMMUTABLE para poder ser usada em CHECK.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_estado_fisico_valor(e "EstadoFisico")
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE e
    WHEN 'SUCATA' THEN 0
    WHEN 'RUIM' THEN 1
    WHEN 'REGULAR' THEN 2
    WHEN 'BOM' THEN 3
    WHEN 'EXCELENTE' THEN 4
  END
$$;

-- ============================================================
-- Movimentacao: rede de segurança da R4 (queda de 2+ níveis exige justificativa
-- com no mínimo 10 caracteres) e da R10 (precisa mudar status ou estado)
-- ============================================================
ALTER TABLE "movimentacoes"
  ADD CONSTRAINT "chk_movimentacao_justificativa_queda"
  CHECK (
    fn_estado_fisico_valor(estado_novo) > fn_estado_fisico_valor(estado_anterior) - 2
    OR (justificativa IS NOT NULL AND char_length(btrim(justificativa)) >= 10)
  );

CREATE OR REPLACE FUNCTION fn_movimentacao_sem_mudanca()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status_anterior = NEW.status_novo
     AND NEW.estado_anterior = NEW.estado_novo THEN
    RAISE EXCEPTION 'Movimentação inválida: status e estado físico são idênticos ao anterior. Pelo menos um deve mudar.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_movimentacao_sem_mudanca
BEFORE INSERT ON "movimentacoes"
FOR EACH ROW
EXECUTE FUNCTION fn_movimentacao_sem_mudanca();

-- Movimentacao é imutável (append-only), sem exceção.
-- TRUNCATE não é bloqueado de propósito: a limpeza entre testes usa TRUNCATE ... CASCADE.
CREATE OR REPLACE FUNCTION fn_movimentacao_imutavel()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Movimentações são imutáveis: % não permitido.', TG_OP
    USING ERRCODE = 'P0001';
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_movimentacao_imutavel
BEFORE UPDATE OR DELETE ON "movimentacoes"
FOR EACH ROW
EXECUTE FUNCTION fn_movimentacao_imutavel();

-- ============================================================
-- Auditoria imutável.
-- UPDATE: sempre bloqueado.
-- DELETE: só com a variável de sessão greencode.limpeza = 'on' (SET LOCAL na
-- transação do comando de limpeza) E registro com mais de 180 dias.
-- TRUNCATE: bloqueado.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_auditoria_imutavel()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  limpeza_ativa TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Registros de auditoria são imutáveis: UPDATE não permitido.'
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- current_setting(..., true) devolve NULL quando a variável nunca foi definida;
    -- sem o COALESCE, "NULL <> 'on'" seria NULL e o DELETE passaria (bug encontrado nos testes).
    limpeza_ativa := COALESCE(current_setting('greencode.limpeza', true), '');

    IF limpeza_ativa <> 'on' THEN
      RAISE EXCEPTION 'Registros de auditoria são imutáveis: DELETE não permitido sem autorização de limpeza.'
        USING ERRCODE = 'P0001';
    END IF;

    IF OLD.criado_em > NOW() - INTERVAL '180 days' THEN
      RAISE EXCEPTION 'Registro de auditoria dentro do período de retenção de 180 dias. Não pode ser apagado.'
        USING ERRCODE = 'P0001';
    END IF;

    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_auditoria_imutavel
BEFORE UPDATE OR DELETE ON "auditorias"
FOR EACH ROW
EXECUTE FUNCTION fn_auditoria_imutavel();

CREATE OR REPLACE FUNCTION fn_auditoria_bloquear_truncate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'TRUNCATE não permitido na tabela de auditorias.'
    USING ERRCODE = 'P0001';
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_auditoria_bloquear_truncate
BEFORE TRUNCATE ON "auditorias"
FOR EACH STATEMENT
EXECUTE FUNCTION fn_auditoria_bloquear_truncate();
