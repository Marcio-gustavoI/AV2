import { describe, expect, it } from 'vitest';
import {
  ErroRegraDeNegocio,
  EstadoFisico,
  LoteFactory,
  MovimentacaoFactory,
  RelogioFixo,
  StatusEquipamento,
  TipoEquipamento,
  ValidadorMovimentacao,
  formatarCodigoBarras,
  validarTransicaoDeStatus,
  validarTransicaoOuFalhar,
} from '../../../src/domain/index.js';

describe('Regras de transição, ValidadorMovimentacao e Fábricas (R3, R4, R5, R6, R10)', () => {
  const validadorMov = new ValidadorMovimentacao();
  const movFactory = new MovimentacaoFactory();

  it('permite o fluxo linear completo RECEBIDO -> EM_TRIAGEM -> TRIADO -> EM_DESMONTE -> DESMONTADO -> DESTINADO', () => {
    expect(
      validarTransicaoDeStatus({
        statusAnterior: StatusEquipamento.RECEBIDO,
        statusNovo: StatusEquipamento.EM_TRIAGEM,
        triagemCompleta: false,
      }),
    ).toBeNull();

    expect(
      validarTransicaoDeStatus({
        statusAnterior: StatusEquipamento.EM_TRIAGEM,
        statusNovo: StatusEquipamento.TRIADO,
        triagemCompleta: true,
      }),
    ).toBeNull();

    expect(
      validarTransicaoDeStatus({
        statusAnterior: StatusEquipamento.TRIADO,
        statusNovo: StatusEquipamento.EM_DESMONTE,
        triagemCompleta: true,
      }),
    ).toBeNull();

    expect(
      validarTransicaoDeStatus({
        statusAnterior: StatusEquipamento.EM_DESMONTE,
        statusNovo: StatusEquipamento.DESMONTADO,
        triagemCompleta: true,
      }),
    ).toBeNull();

    expect(
      validarTransicaoDeStatus({
        statusAnterior: StatusEquipamento.DESMONTADO,
        statusNovo: StatusEquipamento.DESTINADO,
        triagemCompleta: true,
      }),
    ).toBeNull();
  });

  it('transição de status inválida: bloqueia pulo de etapas e retrocesso (R5)', () => {
    expect(
      validarTransicaoDeStatus({
        statusAnterior: StatusEquipamento.RECEBIDO,
        statusNovo: StatusEquipamento.TRIADO,
        triagemCompleta: true,
      }),
    ).not.toBeNull();

    expect(
      validarTransicaoDeStatus({
        statusAnterior: StatusEquipamento.TRIADO,
        statusNovo: StatusEquipamento.EM_TRIAGEM,
        triagemCompleta: true,
      }),
    ).not.toBeNull();

    expect(() =>
      validarTransicaoOuFalhar({
        statusAnterior: StatusEquipamento.EM_TRIAGEM,
        statusNovo: StatusEquipamento.RECEBIDO,
        triagemCompleta: false,
      }),
    ).toThrow(ErroRegraDeNegocio);
  });

  it('desmonte sem triagem: bloqueia EM_DESMONTE e DESMONTADO quando triagemCompleta = false (R3)', () => {
    const erroEmDesmonte = validarTransicaoDeStatus({
      statusAnterior: StatusEquipamento.TRIADO,
      statusNovo: StatusEquipamento.EM_DESMONTE,
      triagemCompleta: false,
    });
    expect(erroEmDesmonte).toContain('triagem completa');

    const erroDesmontado = validarTransicaoDeStatus({
      statusAnterior: StatusEquipamento.EM_DESMONTE,
      statusNovo: StatusEquipamento.DESMONTADO,
      triagemCompleta: false,
    });
    expect(erroDesmontado).toContain('triagem completa');
  });

  it('queda de 2 níveis sem justificativa (422): exige justificativa com mínimo de 10 caracteres (R4)', () => {
    const semJust = validadorMov.validar({
      statusAnterior: StatusEquipamento.RECEBIDO,
      statusNovo: StatusEquipamento.EM_TRIAGEM,
      estadoAnterior: EstadoFisico.EXCELENTE,
      estadoNovo: EstadoFisico.REGULAR,
      triagemCompleta: false,
      justificativa: '',
    });
    expect(semJust.valido).toBe(false);
    expect(semJust.erros[0]?.campo).toBe('justificativa');

    const justCurta = validadorMov.validar({
      statusAnterior: StatusEquipamento.RECEBIDO,
      statusNovo: StatusEquipamento.EM_TRIAGEM,
      estadoAnterior: EstadoFisico.BOM,
      estadoNovo: EstadoFisico.SUCATA,
      triagemCompleta: false,
      justificativa: 'curta',
    });
    expect(justCurta.valido).toBe(false);

    const comJustValida = validadorMov.validar({
      statusAnterior: StatusEquipamento.RECEBIDO,
      statusNovo: StatusEquipamento.EM_TRIAGEM,
      estadoAnterior: EstadoFisico.EXCELENTE,
      estadoNovo: EstadoFisico.REGULAR,
      triagemCompleta: false,
      justificativa: 'Placa-mãe oxidada e tela quebrada no transporte.',
    });
    expect(comJustValida.valido).toBe(true);
  });

  it('queda de 1 nível sem justificativa (aceita): permite queda de 1 nível ou melhora sem justificativa (R4)', () => {
    const quedaUmNivel = validadorMov.validar({
      statusAnterior: StatusEquipamento.RECEBIDO,
      statusNovo: StatusEquipamento.RECEBIDO,
      estadoAnterior: EstadoFisico.EXCELENTE,
      estadoNovo: EstadoFisico.BOM,
      triagemCompleta: false,
    });
    expect(quedaUmNivel.valido).toBe(true);

    const melhora = validadorMov.validar({
      statusAnterior: StatusEquipamento.RECEBIDO,
      statusNovo: StatusEquipamento.RECEBIDO,
      estadoAnterior: EstadoFisico.RUIM,
      estadoNovo: EstadoFisico.BOM,
      triagemCompleta: false,
    });
    expect(melhora.valido).toBe(true);
  });

  it('movimentação sem mudança: rejeita quando status e estado físico permanecem iguais (R10)', () => {
    const res = validadorMov.validar({
      statusAnterior: StatusEquipamento.RECEBIDO,
      statusNovo: StatusEquipamento.RECEBIDO,
      estadoAnterior: EstadoFisico.BOM,
      estadoNovo: EstadoFisico.BOM,
      triagemCompleta: false,
    });
    expect(res.valido).toBe(false);
    expect(res.erros[0]?.campo).toBe('movimentacao');
  });

  it('MovimentacaoFactory cria movimentação com versao = 1 e LoteFactory gera códigos de barras GC-XXXXXX', () => {
    const mov = movFactory.criar({
      equipamentoId: 'eq-1',
      usuarioId: 'usr-1',
      statusAnterior: StatusEquipamento.RECEBIDO,
      statusNovo: StatusEquipamento.EM_TRIAGEM,
      estadoAnterior: EstadoFisico.BOM,
      estadoNovo: EstadoFisico.BOM,
      triagemCompleta: false,
    });
    expect(mov.versao).toBe(1);
    expect(mov.statusNovo).toBe(StatusEquipamento.EM_TRIAGEM);

    const relogio = new RelogioFixo(new Date('2026-10-21T15:00:00.000Z'));
    const loteFactory = new LoteFactory(relogio);
    let seq = 0;
    const lote = loteFactory.criar(
      {
        organizacaoId: 'org-1',
        notaFiscal: 'NF-900',
        transportadora: 'TransVerde',
        dataEntrada: '2026-10-21',
        equipamentos: [
          {
            tipo: TipoEquipamento.NOTEBOOK,
            descricao: 'Dell Latitude',
            estadoFisico: EstadoFisico.BOM,
            valorAquisicao: 2500.5,
          },
          {
            tipo: TipoEquipamento.MONITOR,
            descricao: 'LG 24 pol',
            estadoFisico: EstadoFisico.REGULAR,
            codigoBarrasInterno: 'GC-000999',
          },
        ],
      },
      () => formatarCodigoBarras(++seq),
    );

    expect(lote.equipamentos).toHaveLength(2);
    expect(lote.equipamentos[0]?.codigoBarrasInterno).toBe('GC-000001');
    expect(lote.equipamentos[0]?.valorAquisicao).toBe('2500.50');
    expect(lote.equipamentos[1]?.codigoBarrasInterno).toBe('GC-000999');
  });
});
