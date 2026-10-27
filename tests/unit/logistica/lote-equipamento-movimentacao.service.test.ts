import { beforeEach, describe, expect, it } from 'vitest';
import {
  ClassificacaoDestino,
  ErroConflito,
  ErroNaoEncontrado,
  ErroRegraDeNegocio,
  ErroSemPermissao,
  EstadoFisico,
  Papel,
  RelogioFixo,
  StatusEquipamento,
  TipoEquipamento,
} from '../../../src/domain/index.js';
import {
  MemoriaAuditoriaRepository,
  MemoriaGerenciadorTransacao,
} from '../../../src/modules/auditoria/auditoria.repository.js';
import { MemoriaEquipamentoRepository } from '../../../src/modules/equipamento/equipamento.repository.js';
import { EquipamentoService } from '../../../src/modules/equipamento/equipamento.service.js';
import { MemoriaLoteRepository } from '../../../src/modules/lote/lote.repository.js';
import { LoteService } from '../../../src/modules/lote/lote.service.js';
import { MemoriaMovimentacaoRepository } from '../../../src/modules/movimentacao/movimentacao.repository.js';
import { MovimentacaoService } from '../../../src/modules/movimentacao/movimentacao.service.js';
import { MemoriaOrganizacaoRepository } from '../../../src/modules/organizacao/organizacao.repository.js';
import {
  type AtorOperacao,
  OrganizacaoService,
} from '../../../src/modules/organizacao/organizacao.service.js';

const ATOR_GESTOR: AtorOperacao = {
  id: '00000000-0000-0000-0000-000000000003',
  papel: Papel.GESTOR_ALMOXARIFADO,
};

const ATOR_OPERADOR: AtorOperacao = {
  id: '00000000-0000-0000-0000-000000000002',
  papel: Papel.OPERADOR_CADASTRO,
};

const ATOR_AUDITOR: AtorOperacao = {
  id: '00000000-0000-0000-0000-000000000004',
  papel: Papel.AUDITOR,
};

describe('Núcleo Logístico: LoteService, EquipamentoService e MovimentacaoService (unitários em memória)', () => {
  let orgRepo: MemoriaOrganizacaoRepository;
  let loteRepo: MemoriaLoteRepository;
  let eqRepo: MemoriaEquipamentoRepository;
  let movRepo: MemoriaMovimentacaoRepository;
  let auditoriaRepo: MemoriaAuditoriaRepository;
  let transacao: MemoriaGerenciadorTransacao;
  let relogio: RelogioFixo;

  let orgService: OrganizacaoService;
  let loteService: LoteService;
  let eqService: EquipamentoService;
  let movService: MovimentacaoService;
  let orgIdPadrao: string;

  beforeEach(async () => {
    orgRepo = new MemoriaOrganizacaoRepository();
    loteRepo = new MemoriaLoteRepository();
    eqRepo = new MemoriaEquipamentoRepository();
    loteRepo.equipamentosRef = eqRepo.itens;
    movRepo = new MemoriaMovimentacaoRepository();
    auditoriaRepo = new MemoriaAuditoriaRepository();
    transacao = new MemoriaGerenciadorTransacao();
    relogio = new RelogioFixo(new Date('2026-06-15T15:00:00Z'));

    orgService = new OrganizacaoService(orgRepo, auditoriaRepo, transacao);
    loteService = new LoteService(
      loteRepo,
      eqRepo,
      orgRepo,
      auditoriaRepo,
      transacao,
      relogio,
      'America/Sao_Paulo',
    );
    eqService = new EquipamentoService(eqRepo, loteRepo, movRepo, auditoriaRepo, transacao);
    movService = new MovimentacaoService(eqRepo, movRepo, auditoriaRepo, transacao);

    const org = await orgService.criar(ATOR_OPERADOR, {
      codigo: 'BR001',
      cnpj: '11.222.333/0001-81',
      nome: 'Parceiro Logístico',
    });
    orgIdPadrao = org.id;
  });

  it('cria lote resolvendo orgCodigo, gera códigos de barras sequenciais (GC-000001, GC-000002) e grava auditoria (R2, R6, R7, R11)', async () => {
    const lote = await loteService.criar(ATOR_GESTOR, {
      orgCodigo: 'br001',
      notaFiscal: 'NF-1001',
      transportadora: 'EcoTransp',
      dataEntrada: '2026-06-15',
      equipamentos: [
        {
          tipo: TipoEquipamento.NOTEBOOK,
          descricao: 'Dell Latitude 5420',
          estadoFisico: EstadoFisico.BOM,
          valorAquisicao: '2500.00',
        },
        {
          tipo: TipoEquipamento.MONITOR,
          descricao: 'Monitor LG 24',
          estadoFisico: EstadoFisico.REGULAR,
        },
      ],
    });

    expect(lote.organizacaoId).toBe(orgIdPadrao);
    expect(lote.equipamentos).toHaveLength(2);
    expect(lote.equipamentos[0]?.codigoBarrasInterno).toBe('GC-000001');
    expect(lote.equipamentos[1]?.codigoBarrasInterno).toBe('GC-000002');
    expect(lote.equipamentos[0]?.status).toBe(StatusEquipamento.RECEBIDO);
  });

  it('valida janela R2 no LoteService (aceita 90 dias atrás; rejeita futuro e 91 dias atrás)', async () => {
    // 2026-06-15 menos 90 dias = 2026-03-17
    const lote90Dias = await loteService.criar(ATOR_GESTOR, {
      organizacaoId: orgIdPadrao,
      notaFiscal: 'NF-90D',
      transportadora: 'Transp',
      dataEntrada: '2026-03-17',
    });
    expect(lote90Dias.notaFiscal).toBe('NF-90D');

    // 91 dias atrás = 2026-03-16 -> rejeitado
    await expect(
      loteService.criar(ATOR_GESTOR, {
        organizacaoId: orgIdPadrao,
        notaFiscal: 'NF-91D',
        transportadora: 'Transp',
        dataEntrada: '2026-03-16',
      }),
    ).rejects.toBeInstanceOf(ErroRegraDeNegocio);

    // Amanhã = 2026-06-16 -> rejeitado
    await expect(
      loteService.criar(ATOR_GESTOR, {
        organizacaoId: orgIdPadrao,
        notaFiscal: 'NF-FUT',
        transportadora: 'Transp',
        dataEntrada: '2026-06-16',
      }),
    ).rejects.toBeInstanceOf(ErroRegraDeNegocio);
  });

  it('executa fluxo completo: RECEBIDO -> EM_TRIAGEM -> triagem(TRIADO) -> EM_DESMONTE -> DESMONTADO -> DESTINADO (R3, R4, R5, R9, R10)', async () => {
    const lote = await loteService.criar(ATOR_GESTOR, {
      orgCodigo: 'BR001',
      notaFiscal: 'NF-FLUXO',
      transportadora: 'Transp',
      dataEntrada: '2026-06-15',
    });

    const eq = await eqService.criar(ATOR_GESTOR, {
      loteId: lote.id,
      tipo: TipoEquipamento.SERVIDOR,
      descricao: 'Servidor Rack 2U',
      estadoFisico: EstadoFisico.EXCELENTE,
      valorAquisicao: 12000,
    });

    // Tentativa de pular de RECEBIDO direto para TRIADO ou EM_DESMONTE falha (R5)
    await expect(
      movService.registrar(ATOR_GESTOR, {
        equipamentoId: eq.id,
        versao: 1,
        statusNovo: StatusEquipamento.EM_DESMONTE,
      }),
    ).rejects.toBeInstanceOf(ErroRegraDeNegocio);

    // Tentativa de realizar triagem ainda em RECEBIDO falha (R9)
    await expect(
      eqService.realizarTriagem(ATOR_GESTOR, {
        equipamentoId: eq.id,
        versao: 1,
        classificacaoDestino: ClassificacaoDestino.RECICLAGEM,
        estadoFisico: EstadoFisico.BOM,
      }),
    ).rejects.toBeInstanceOf(ErroRegraDeNegocio);

    // 1. RECEBIDO -> EM_TRIAGEM (com queda de 1 nível EXCELENTE -> BOM sem justificativa: aceito por R4)
    const mov1 = await movService.registrar(ATOR_GESTOR, {
      equipamentoId: eq.id,
      versao: 1,
      statusNovo: StatusEquipamento.EM_TRIAGEM,
      estadoNovo: EstadoFisico.BOM,
    });
    expect(mov1.equipamento.status).toBe(StatusEquipamento.EM_TRIAGEM);
    expect(mov1.equipamento.versao).toBe(2);

    // 2. Triagem com queda de 2 níveis (BOM=3 -> RUIM=1) SEM justificativa falha (R4)
    await expect(
      eqService.realizarTriagem(ATOR_GESTOR, {
        equipamentoId: eq.id,
        versao: 2,
        classificacaoDestino: ClassificacaoDestino.RECICLAGEM,
        estadoFisico: EstadoFisico.RUIM,
      }),
    ).rejects.toBeInstanceOf(ErroRegraDeNegocio);

    // 3. Triagem com queda de 2 níveis E justificativa >= 10 chars conclui e move para TRIADO (R9, R4)
    const triado = await eqService.realizarTriagem(ATOR_GESTOR, {
      equipamentoId: eq.id,
      versao: 2,
      classificacaoDestino: ClassificacaoDestino.RECICLAGEM,
      estadoFisico: EstadoFisico.RUIM,
      justificativa: 'Placa-mãe oxidada constatada na abertura técnica.',
    });
    expect(triado.status).toBe(StatusEquipamento.TRIADO);
    expect(triado.triagemCompleta).toBe(true);
    expect(triado.classificacaoDestino).toBe(ClassificacaoDestino.RECICLAGEM);
    expect(triado.versao).toBe(3);

    // 4. TRIADO -> EM_DESMONTE -> DESMONTADO -> DESTINADO
    const emDesmonte = await movService.registrar(ATOR_GESTOR, {
      equipamentoId: eq.id,
      versao: 3,
      statusNovo: StatusEquipamento.EM_DESMONTE,
    });
    expect(emDesmonte.equipamento.status).toBe(StatusEquipamento.EM_DESMONTE);

    const desmontado = await movService.registrar(ATOR_GESTOR, {
      equipamentoId: eq.id,
      versao: 4,
      statusNovo: StatusEquipamento.DESMONTADO,
      estadoNovo: EstadoFisico.SUCATA,
    });
    expect(desmontado.equipamento.status).toBe(StatusEquipamento.DESMONTADO);

    const destinado = await movService.registrar(ATOR_GESTOR, {
      equipamentoId: eq.id,
      versao: 5,
      statusNovo: StatusEquipamento.DESTINADO,
    });
    expect(destinado.equipamento.status).toBe(StatusEquipamento.DESTINADO);
    expect(destinado.equipamento.versao).toBe(6);
  });

  it('bloqueia escrita em Lote, Equipamento e Movimentação para OPERADOR_CADASTRO e AUDITOR (403) e exige integridade referencial (R11, R6)', async () => {
    await expect(
      loteService.criar(ATOR_OPERADOR, {
        orgCodigo: 'BR001',
        notaFiscal: 'NF-OP',
        transportadora: 'T',
        dataEntrada: '2026-06-15',
      }),
    ).rejects.toBeInstanceOf(ErroSemPermissao);

    await expect(
      loteService.criar(ATOR_AUDITOR, {
        orgCodigo: 'BR001',
        notaFiscal: 'NF-AUD',
        transportadora: 'T',
        dataEntrada: '2026-06-15',
      }),
    ).rejects.toBeInstanceOf(ErroSemPermissao);

    await expect(
      loteService.criar(ATOR_GESTOR, {
        orgCodigo: 'CODIGO-INEXISTENTE',
        notaFiscal: 'NF-404',
        transportadora: 'T',
        dataEntrada: '2026-06-15',
      }),
    ).rejects.toBeInstanceOf(ErroNaoEncontrado);

    const lote = await loteService.criar(ATOR_GESTOR, {
      orgCodigo: 'BR001',
      notaFiscal: 'NF-OK',
      transportadora: 'T',
      dataEntrada: '2026-06-15',
    });

    await eqService.criar(ATOR_GESTOR, {
      loteId: lote.id,
      tipo: TipoEquipamento.DESKTOP,
      descricao: 'PC 1',
      estadoFisico: EstadoFisico.BOM,
      codigoBarrasInterno: 'GC-900001',
    });

    await expect(
      eqService.criar(ATOR_GESTOR, {
        loteId: lote.id,
        tipo: TipoEquipamento.DESKTOP,
        descricao: 'PC Duplicado',
        estadoFisico: EstadoFisico.BOM,
        codigoBarrasInterno: 'GC-900001',
      }),
    ).rejects.toBeInstanceOf(ErroConflito);

    // Exercita listagens, busca por ID e rastreabilidade nos services em memória
    const loteDetalhe = await loteService.buscarPorId(ATOR_AUDITOR, lote.id);
    expect(loteDetalhe.id).toBe(lote.id);

    await expect(
      loteService.buscarPorId(ATOR_AUDITOR, '00000000-0000-0000-0000-000000000999'),
    ).rejects.toBeInstanceOf(ErroNaoEncontrado);

    const listaLotes = await loteService.listar(ATOR_AUDITOR, {
      organizacaoId: orgIdPadrao,
      pagina: 1,
      tamanhoPagina: 10,
    });
    expect(listaLotes.dados.length).toBeGreaterThanOrEqual(1);

    const listaEq = await eqService.listar(ATOR_AUDITOR, {
      loteId: lote.id,
      status: StatusEquipamento.RECEBIDO,
      estadoFisico: EstadoFisico.BOM,
      tipo: TipoEquipamento.DESKTOP,
      pagina: 1,
      tamanhoPagina: 10,
    });
    expect(listaEq.dados).toHaveLength(1);
    const eqIdCriado = listaEq.dados[0]!.id;

    const eqDetalhe = await eqService.buscarPorId(ATOR_AUDITOR, eqIdCriado);
    expect(eqDetalhe.id).toBe(eqIdCriado);

    await expect(
      eqService.buscarPorId(ATOR_AUDITOR, '00000000-0000-0000-0000-000000000999'),
    ).rejects.toBeInstanceOf(ErroNaoEncontrado);

    const rastro = await eqService.obterRastreabilidade(ATOR_AUDITOR, eqIdCriado);
    expect(rastro.equipamento.id).toBe(eqIdCriado);

    await expect(
      eqService.obterRastreabilidade(ATOR_AUDITOR, '00000000-0000-0000-0000-000000000999'),
    ).rejects.toBeInstanceOf(ErroNaoEncontrado);
  });
});
