import { describe, expect, it } from 'vitest';
import {
  ErroRegraDeNegocio,
  EstadoFisico,
  LoteFactory,
  MovimentacaoFactory,
  RelogioFixo,
  StatusEquipamento,
  TipoEquipamento,
  formatarCodigoBarras,
} from '../../../src/domain/index.js';

describe('LoteFactory e MovimentacaoFactory (A1-08, R2, R3, R4, R5, R6, R10, C8)', () => {
  const movFactory = new MovimentacaoFactory();
  const relogio = new RelogioFixo(new Date('2026-10-21T15:00:00.000Z'));
  const loteFactory = new LoteFactory(relogio, 'America/Sao_Paulo');

  it('LoteFactory cria lote com equipamentos em status RECEBIDO, triagemCompleta=false e códigos GC-000001', () => {
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
      () => {
        seq += 1;
        return formatarCodigoBarras(seq);
      },
    );

    expect(lote.equipamentos).toHaveLength(2);
    expect(lote.equipamentos[0]?.codigoBarrasInterno).toBe('GC-000001');
    expect(lote.equipamentos[0]?.status).toBe(StatusEquipamento.RECEBIDO);
    expect(lote.equipamentos[0]?.triagemCompleta).toBe(false);
    expect(lote.equipamentos[0]?.valorAquisicao).toBe('2500.50');
    expect(lote.equipamentos[1]?.codigoBarrasInterno).toBe('GC-000999');
    expect(lote.equipamentos[1]?.status).toBe(StatusEquipamento.RECEBIDO);
  });

  it('LoteFactory rejeita lote com data de entrada futura (R2)', () => {
    expect(() =>
      loteFactory.criar(
        {
          organizacaoId: 'org-1',
          notaFiscal: 'NF-FUTURA',
          transportadora: 'TransVerde',
          dataEntrada: '2026-10-22',
          equipamentos: [],
        },
        () => 'GC-000001',
      ),
    ).toThrow(ErroRegraDeNegocio);
  });

  it('LoteFactory invalida o lote inteiro se qualquer equipamento for inválido (sem descrição)', () => {
    expect(() =>
      loteFactory.criar(
        {
          organizacaoId: 'org-1',
          notaFiscal: 'NF-EQ-INV',
          transportadora: 'TransVerde',
          dataEntrada: '2026-10-21',
          equipamentos: [
            {
              tipo: TipoEquipamento.NOTEBOOK,
              descricao: 'Equipamento Válido',
              estadoFisico: EstadoFisico.BOM,
            },
            {
              tipo: TipoEquipamento.DESKTOP,
              descricao: '   ',
              estadoFisico: EstadoFisico.BOM,
            },
          ],
        },
        () => 'GC-000001',
      ),
    ).toThrow(ErroRegraDeNegocio);
  });

  it('LoteFactory rejeita valorAquisicao negativo, código de barras fora do formato GC-000001 e código repetido no mesmo lote', () => {
    // Valor negativo
    expect(() =>
      loteFactory.criar(
        {
          organizacaoId: 'org-1',
          notaFiscal: 'NF-NEG',
          transportadora: 'TransVerde',
          dataEntrada: '2026-10-21',
          equipamentos: [
            {
              tipo: TipoEquipamento.DESKTOP,
              descricao: 'PC Valor Negativo',
              estadoFisico: EstadoFisico.BOM,
              valorAquisicao: -10,
            },
          ],
        },
        () => 'GC-000001',
      ),
    ).toThrow(ErroRegraDeNegocio);

    // Código fora do formato (ex.: GC-2026-000001 ou ABC-123)
    expect(() =>
      loteFactory.criar(
        {
          organizacaoId: 'org-1',
          notaFiscal: 'NF-FMT',
          transportadora: 'TransVerde',
          dataEntrada: '2026-10-21',
          equipamentos: [
            {
              tipo: TipoEquipamento.DESKTOP,
              descricao: 'PC Formato Inválido',
              estadoFisico: EstadoFisico.BOM,
              codigoBarrasInterno: 'GC-2026-000001',
            },
          ],
        },
        () => 'GC-000001',
      ),
    ).toThrow(ErroRegraDeNegocio);

    // Código repetido no mesmo lote
    expect(() =>
      loteFactory.criar(
        {
          organizacaoId: 'org-1',
          notaFiscal: 'NF-DUP',
          transportadora: 'TransVerde',
          dataEntrada: '2026-10-21',
          equipamentos: [
            {
              tipo: TipoEquipamento.DESKTOP,
              descricao: 'PC 1',
              estadoFisico: EstadoFisico.BOM,
              codigoBarrasInterno: 'GC-000010',
            },
            {
              tipo: TipoEquipamento.DESKTOP,
              descricao: 'PC 2',
              estadoFisico: EstadoFisico.BOM,
              codigoBarrasInterno: 'GC-000010',
            },
          ],
        },
        () => 'GC-000001',
      ),
    ).toThrow(ErroRegraDeNegocio);
  });

  it('MovimentacaoFactory cria movimentação de avanço de status e de reavaliação só de estado físico com versao = 1', () => {
    const avancoStatus = movFactory.criar({
      equipamentoId: 'eq-1',
      usuarioId: 'usr-1',
      statusAnterior: StatusEquipamento.RECEBIDO,
      statusNovo: StatusEquipamento.EM_TRIAGEM,
      estadoAnterior: EstadoFisico.BOM,
      triagemCompleta: false,
    });
    expect(avancoStatus.versao).toBe(1);
    expect(avancoStatus.statusNovo).toBe(StatusEquipamento.EM_TRIAGEM);
    expect(avancoStatus.estadoNovo).toBe(EstadoFisico.BOM);

    const soEstado = movFactory.criar({
      equipamentoId: 'eq-1',
      usuarioId: 'usr-1',
      statusAnterior: StatusEquipamento.RECEBIDO,
      estadoAnterior: EstadoFisico.EXCELENTE,
      estadoNovo: EstadoFisico.BOM,
      triagemCompleta: false,
    });
    expect(soEstado.statusNovo).toBe(StatusEquipamento.RECEBIDO);
    expect(soEstado.estadoNovo).toBe(EstadoFisico.BOM);
  });

  it('MovimentacaoFactory rejeita movimentação sem mudança, queda de 2 sem justificativa, desmonte sem triagem e pulo de etapa', () => {
    // Sem mudança (R10)
    expect(() =>
      movFactory.criar({
        equipamentoId: 'eq-1',
        usuarioId: 'usr-1',
        statusAnterior: StatusEquipamento.RECEBIDO,
        estadoAnterior: EstadoFisico.BOM,
        triagemCompleta: false,
      }),
    ).toThrow(ErroRegraDeNegocio);

    // Queda de 2 níveis sem justificativa (R4)
    expect(() =>
      movFactory.criar({
        equipamentoId: 'eq-1',
        usuarioId: 'usr-1',
        statusAnterior: StatusEquipamento.RECEBIDO,
        statusNovo: StatusEquipamento.EM_TRIAGEM,
        estadoAnterior: EstadoFisico.EXCELENTE,
        estadoNovo: EstadoFisico.REGULAR,
        triagemCompleta: false,
      }),
    ).toThrow(ErroRegraDeNegocio);

    // Desmonte sem triagem (R3)
    expect(() =>
      movFactory.criar({
        equipamentoId: 'eq-1',
        usuarioId: 'usr-1',
        statusAnterior: StatusEquipamento.TRIADO,
        statusNovo: StatusEquipamento.EM_DESMONTE,
        estadoAnterior: EstadoFisico.BOM,
        triagemCompleta: false,
      }),
    ).toThrow(ErroRegraDeNegocio);

    // Pular etapa EM_TRIAGEM -> DESTINADO (R5)
    expect(() =>
      movFactory.criar({
        equipamentoId: 'eq-1',
        usuarioId: 'usr-1',
        statusAnterior: StatusEquipamento.EM_TRIAGEM,
        statusNovo: StatusEquipamento.DESTINADO,
        estadoAnterior: EstadoFisico.BOM,
        triagemCompleta: true,
      }),
    ).toThrow(ErroRegraDeNegocio);
  });
});
