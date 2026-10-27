-- ============================================================================
-- Migração 3: Imutabilidade de codigo_barras_interno em equipamentos (R6 / A1-04)
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_bloquear_alteracao_codigo_barras()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.codigo_barras_interno IS DISTINCT FROM OLD.codigo_barras_interno THEN
    RAISE EXCEPTION 'codigo_barras_interno é imutável e não pode ser alterado após a criação (R6).';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_equipamentos_codigo_barras_imutavel
BEFORE UPDATE ON "equipamentos"
FOR EACH ROW
EXECUTE FUNCTION fn_bloquear_alteracao_codigo_barras();
