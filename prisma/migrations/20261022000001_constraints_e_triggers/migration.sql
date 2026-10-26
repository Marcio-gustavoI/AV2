-- ============================================================
-- Migração 2: Constraints de integridade e triggers de segurança
-- Criada manualmente conforme especificação da AV2
-- ============================================================

-- SEQUENCE para geração de código de barras (thread-safe)
CREATE SEQUENCE IF NOT EXISTS seq_codigo_barras START 1 INCREMENT 1;

-- ---- CHECKs: Parametro ----
ALTER TABLE "parametros"
  ADD CONSTRAINT "chk_parametro_valor_positivo"
  CHECK (valor >= 0);

-- ---- CHECKs: Equipamento ----
ALTER TABLE "equipamentos"
  ADD CONSTRAINT "chk_equipamento_valor_aquisicao_positivo"
  CHECK (valor_aquisicao IS NULL OR valor_aquisicao >= 0);

-- Triagem completa implica classificacao_destino preenchida
ALTER TABLE "equipamentos"
  ADD CONSTRAINT "chk_equipamento_triagem_classificacao"
  CHECK (
    triagem_completa = false
    OR classificacao_destino IS NOT NULL
  );

-- ---- CHECKs: Contrato ----
ALTER TABLE "contratos"
  ADD CONSTRAINT "chk_contrato_fim_apos_inicio"
  CHECK (fim IS NULL OR fim >= inicio);

-- ---- CHECKs: Lote ----
-- Lote não pode ter data futura (regra do banco; regra dos 90 dias fica no service)
ALTER TABLE "lotes"
  ADD CONSTRAINT "chk_lote_data_entrada_nao_futura"
  CHECK (data_entrada <= CURRENT_DATE);

-- ============================================================
-- TRIGGER: Auditoria imutável
-- Bloqueia UPDATE e DELETE exceto quando:
--   - é DELETE com variável de sessão greencode.limpeza = 'on'
--   - E o registro tem mais de 180 dias
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
    -- Verificar se a variável de sessão de limpeza está ativa.
    -- current_setting(..., true) devolve NULL quando a variável nunca foi definida;
    -- COALESCE evita que "NULL <> 'on'" (NULL) deixe passar o DELETE.
    limpeza_ativa := COALESCE(current_setting('greencode.limpeza', true), '');

    IF limpeza_ativa <> 'on' THEN
      RAISE EXCEPTION 'Registros de auditoria são imutáveis: DELETE não permitido sem autorização de limpeza.'
        USING ERRCODE = 'P0001';
    END IF;

    -- Verificar retenção mínima de 180 dias
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

-- TRUNCATE bloqueado via trigger de statement
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

-- ============================================================
-- TRIGGER: Movimentacao sem mudança real bloqueada
-- Impede inserir movimentação onde statusAnterior=statusNovo
-- E estadoAnterior=estadoNovo ao mesmo tempo (R10)
-- ============================================================

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
