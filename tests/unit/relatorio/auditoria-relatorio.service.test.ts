import { beforeEach, describe, expect, it } from 'vitest';
import {
  ErroSemPermissao,
  EstadoFisico,
  Papel,
  StatusEquipamento,
  TipoEquipamento,
} from '../../../src/domain/index.js';
import { MemoriaAuditoriaRepository } from '../../../src/modules/auditoria/auditoria.repository.js';
import { AuditoriaService } from '../../../src/modules/auditoria/auditoria.service.js';
import type { AtorOperacao } from '../../../src/modules/organizacao/organizacao.service.js';
import { MemoriaParametroRepository } from '../../../src/modules/parametro/parametro.repository.js';
import { MemoriaRelatorioRepository } from '../../../src/modules/relatorio/relatorio.repository.js';
import { RelatorioService } from '../../../src/modules/relatorio/relatorio.service.js';

const ATOR_ADMIN: AtorOperacao = {
  id: '00000000-0000-0000-0000-000000000001',
  papel: Papel.ADMIN,
};
const ATOR_AUDITOR: AtorOperacao = {
  id: '00000000-0000-0000-0000-000000000004',
  papel: Papel.AUDITOR,
};
const ATOR_GESTOR: AtorOperacao = {
  id: '00000000-0000-0000-0000-000000000003',
  papel: Papel.GESTOR_ALMOXARIFADO,
};

describe('Fase 7: AuditoriaService e RelatorioService (unitários em memória)', () => {
  let auditoriaRepo: MemoriaAuditoriaRepository;
  let parametroRepo: MemoriaParametroRepository;
  let relatorioRepo: MemoriaRelatorioRepository;
  let auditoriaService: AuditoriaService;
  let relatorioService: RelatorioService;

  beforeEach(() => {
    auditoriaRepo = new MemoriaAuditoriaRepository();
    parametroRepo = new MemoriaParametroRepository();
    relatorioRepo = new MemoriaRelatorioRepository();
    auditoriaService = new AuditoriaService(auditoriaRepo);
    relatorioService = new RelatorioService(relatorioRepo, parametroRepo);
  });

  it('cálculo financeiro com casos numéricos conferidos à mão (R8, Decimal com ROUND_HALF_UP a 2 casas e itens sem valor contados à parte)', async () => {
    // Configura parâmetros exatos:
    // ALIQUOTA_IMPOSTO = 0.15 (15%)
    // COEF_DEPRECIACAO_NOTEBOOK = 0.333333 -> (1 - 0.333333) = 0.666667
    // COEF_DEPRECIACAO_SERVIDOR = 0.25 -> (1 - 0.25) = 0.75
    await parametroRepo.criar('ALIQUOTA_IMPOSTO', '0.150000');
    await parametroRepo.criar('COEF_DEPRECIACAO_NOTEBOOK', '0.333333');
    await parametroRepo.criar('COEF_DEPRECIACAO_SERVIDOR', '0.250000');

    relatorioRepo.itens = [
      {
        // Caso 1: Notebook com valorAquisicao = 1000.00
        // valorResidual = 1000.00 * (1 - 0.333333) = 666.667 -> ROUND_HALF_UP(2) = 666.67
        // imposto = 666.67 * 0.15 = 100.0005 -> ROUND_HALF_UP(2) = 100.00
        id: '00000000-0000-0000-0000-000000000101',
        codigoBarrasInterno: 'GC-000101',
        tipo: TipoEquipamento.NOTEBOOK,
        descricao: 'Notebook Teste R8',
        valorAquisicao: '1000.00',
        estadoFisico: EstadoFisico.BOM,
        status: StatusEquipamento.TRIADO,
        criadoEm: new Date('2026-05-10T10:00:00Z'),
        organizacao: { id: 'org-1', codigo: 'BR001', nome: 'Org 1' },
      },
      {
        // Caso 2: Servidor com valorAquisicao = 2550.50
        // valorResidual = 2550.50 * 0.75 = 1912.875 -> ROUND_HALF_UP(2) = 1912.88
        // imposto = 1912.88 * 0.15 = 286.932 -> ROUND_HALF_UP(2) = 286.93
        id: '00000000-0000-0000-0000-000000000102',
        codigoBarrasInterno: 'GC-000102',
        tipo: TipoEquipamento.SERVIDOR,
        descricao: 'Servidor Teste R8',
        valorAquisicao: '2550.50',
        estadoFisico: EstadoFisico.EXCELENTE,
        status: StatusEquipamento.RECEBIDO,
        criadoEm: new Date('2026-05-11T10:00:00Z'),
        organizacao: { id: 'org-1', codigo: 'BR001', nome: 'Org 1' },
      },
      {
        // Caso 3: Equipamento sem valorAquisicao -> fora do total e contado à parte
        id: '00000000-0000-0000-0000-000000000103',
        codigoBarrasInterno: 'GC-000103',
        tipo: TipoEquipamento.PERIFERICO,
        descricao: 'Mouse sem valor de aquisição',
        valorAquisicao: null,
        estadoFisico: EstadoFisico.SUCATA,
        status: StatusEquipamento.DESMONTADO,
        criadoEm: new Date('2026-05-12T10:00:00Z'),
        organizacao: { id: 'org-1', codigo: 'BR001', nome: 'Org 1' },
      },
    ];

    const rel = await relatorioService.gerarFinanceiro(ATOR_AUDITOR);

    expect(rel.totalEquipamentosAvaliados).toBe(3);
    expect(rel.equipamentosComValorAquisicao).toBe(2);
    expect(rel.equipamentosSemValorAquisicao).toBe(1);
    expect(rel.itens).toHaveLength(2);

    expect(rel.itens[0]?.valorResidual).toBe('666.67');
    expect(rel.itens[0]?.imposto).toBe('100.00');
    expect(rel.itens[1]?.valorResidual).toBe('1912.88');
    expect(rel.itens[1]?.imposto).toBe('286.93');

    // Soma conferida à mão:
    // Aquisição: 1000.00 + 2550.50 = 3550.50
    // Residual: 666.67 + 1912.88 = 2579.55
    // Imposto: 100.00 + 286.93 = 386.93
    expect(rel.somaValorAquisicao).toBe('3550.50');
    expect(rel.somaValorResidual).toBe('2579.55');
    expect(rel.somaImposto).toBe('386.93');
  });

  it('bloqueia acesso a AuditoriaService e RelatorioService por GESTOR_ALMOXARIFADO (403) e aplica limite máximo de paginação (100)', async () => {
    await expect(auditoriaService.listar(ATOR_GESTOR, {})).rejects.toBeInstanceOf(
      ErroSemPermissao,
    );
    await expect(relatorioService.gerarResumo(ATOR_GESTOR)).rejects.toBeInstanceOf(
      ErroSemPermissao,
    );

    const pag = await auditoriaService.listar(ATOR_ADMIN, {
      pagina: 1,
      tamanhoPagina: 500, // deve ser limitado a 100
    });
    expect(pag.paginacao.tamanhoPagina).toBe(100);
  });
});
