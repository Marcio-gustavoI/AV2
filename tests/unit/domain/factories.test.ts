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

describe('LoteFactory e MovimentacaoFactory (A1-08, R2, R6, C8)', () => {
  const movFactory = new MovimentacaoFactory();
  const relogio = new RelogioFixo(new Date('2026-10-21T15:00:00.000Z'));
  const loteFactory = new LoteFactory(relogio, 'America/Sao_Paulo');

  it('MovimentacaoFactory cria movimentação imutável com versao = 1', () => {
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
  });

  it('LoteFactory monta lote e equipamentos gerando códigos de barras GC-XXXXXX', () => {
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
    expect(lote.equipamentos[0]?.valorAquisicao).toBe('2500.50');
    expect(lote.equipamentos[1]?.codigoBarrasInterno).toBe('GC-000999');
  });

  it('LoteFactory rejeita códigos de barras duplicados no mesmo lote ou fora do formato GC-XXXXXX', () => {
    expect(() =>
      loteFactory.criar(
        {
          organizacaoId: 'org-1',
          notaFiscal: 'NF-901',
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
});
