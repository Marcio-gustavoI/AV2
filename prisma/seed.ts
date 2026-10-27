import 'dotenv/config';
import bcrypt from 'bcryptjs';
import {
  ClassificacaoDestino,
  EstadoFisico,
  Papel,
  StatusEquipamento,
  TipoEquipamento,
} from '../src/domain/index.js';
import { prisma } from '../src/lib/prisma.js';

function obterDataPassadaNoFuso(diasAtras: number, fuso = 'America/Sao_Paulo'): Date {
  const agora = new Date();
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(agora);
  const ano = Number(partes.find((p) => p.type === 'year')?.value);
  const mes = Number(partes.find((p) => p.type === 'month')?.value);
  const dia = Number(partes.find((p) => p.type === 'day')?.value);
  return new Date(Date.UTC(ano, mes - 1, dia - diasAtras));
}

export interface ResumoSeed {
  usuarios: number;
  parametros: number;
  organizacoes: number;
  contratos: number;
  lotes: number;
  equipamentos: number;
  movimentacoes: number;
  auditorias: number;
}

/**
 * Seed idempotente (A2-15, seção 14):
 * - Recusa rodar com `NODE_ENV === 'production'`.
 * - Usa `upsert` com IDs e chaves determinísticas para que rodar duas vezes não duplique nem falhe.
 * - Popula 1 usuário por papel, todos os parâmetros, 4 organizações (2 com contrato, 2 sem),
 *   lotes (incluindo um com exatamente 90 dias de idade), equipamentos em todos os 6 status
 *   e todos os 5 estados físicos, movimentações históricas e trilha de auditoria coerente.
 */
export async function executarSeed(ambiente: string | undefined = process.env['NODE_ENV']): Promise<ResumoSeed> {
  if (ambiente === 'production') {
    throw new Error(
      'Operação recusada: o seed de desenvolvimento não pode ser executado com NODE_ENV=production.',
    );
  }

  const rounds = 10;
  const hashAdmin = await bcrypt.hash('AdminSeed123', rounds);
  const hashOperador = await bcrypt.hash('OperadorSeed123', rounds);
  const hashGestor = await bcrypt.hash('GestorSeed123', rounds);
  const hashAuditor = await bcrypt.hash('AuditorSeed123', rounds);

  const IDS_USUARIOS = {
    ADMIN: '10000000-0000-0000-0000-000000000001',
    OPERADOR: '10000000-0000-0000-0000-000000000002',
    GESTOR: '10000000-0000-0000-0000-000000000003',
    AUDITOR: '10000000-0000-0000-0000-000000000004',
  } as const;

  // 1. Usuários (1 por papel)
  const usuariosSeed = [
    {
      id: IDS_USUARIOS.ADMIN,
      email: 'admin@greencode.com.br',
      senhaHash: hashAdmin,
      papel: Papel.ADMIN,
    },
    {
      id: IDS_USUARIOS.OPERADOR,
      email: 'operador@greencode.com.br',
      senhaHash: hashOperador,
      papel: Papel.OPERADOR_CADASTRO,
    },
    {
      id: IDS_USUARIOS.GESTOR,
      email: 'gestor@greencode.com.br',
      senhaHash: hashGestor,
      papel: Papel.GESTOR_ALMOXARIFADO,
    },
    {
      id: IDS_USUARIOS.AUDITOR,
      email: 'auditor@greencode.com.br',
      senhaHash: hashAuditor,
      papel: Papel.AUDITOR,
    },
  ] as const;

  for (const u of usuariosSeed) {
    await prisma.usuario.upsert({
      where: { email: u.email },
      update: {
        papel: u.papel,
        ativo: true,
      },
      create: {
        id: u.id,
        email: u.email,
        senhaHash: u.senhaHash,
        papel: u.papel,
        ativo: true,
      },
    });
  }

  // 2. Parâmetros globais (ALIQUOTA_IMPOSTO + COEF_DEPRECIACAO_<TIPO>)
  const parametrosSeed = [
    { chave: 'ALIQUOTA_IMPOSTO', valor: '0.120000' },
    { chave: 'COEF_DEPRECIACAO_DESKTOP', valor: '0.400000' },
    { chave: 'COEF_DEPRECIACAO_NOTEBOOK', valor: '0.350000' },
    { chave: 'COEF_DEPRECIACAO_MONITOR', valor: '0.450000' },
    { chave: 'COEF_DEPRECIACAO_SERVIDOR', valor: '0.250000' },
    { chave: 'COEF_DEPRECIACAO_PERIFERICO', valor: '0.600000' },
    { chave: 'COEF_DEPRECIACAO_REDE', valor: '0.300000' },
    { chave: 'COEF_DEPRECIACAO_OUTRO', valor: '0.500000' },
  ] as const;

  for (const p of parametrosSeed) {
    await prisma.parametro.upsert({
      where: { chave: p.chave },
      update: { valor: p.valor },
      create: { chave: p.chave, valor: p.valor, versao: 1 },
    });
  }

  // 3. Organizações (4 organizações com CNPJs válidos: 3 numéricos e 1 alfanumérico IN RFB 2.229/2024)
  const IDS_ORGS = {
    ORG1: '20000000-0000-0000-0000-000000000001',
    ORG2: '20000000-0000-0000-0000-000000000002',
    ORG3: '20000000-0000-0000-0000-000000000003',
    ORG4: '20000000-0000-0000-0000-000000000004',
  } as const;

  const orgsSeed = [
    {
      id: IDS_ORGS.ORG1,
      codigo: 'BR001',
      cnpj: '11222333000181',
      nome: 'Cooperativa ReciclaSP',
    },
    {
      id: IDS_ORGS.ORG2,
      codigo: 'BR002',
      cnpj: '11444777000161',
      nome: 'Instituto EcoEletrônicos Sul',
    },
    {
      id: IDS_ORGS.ORG3,
      codigo: 'BR003',
      cnpj: '12ABC34501DE35',
      nome: 'Polo Logístico Reverso Alfa S.A.',
    },
    {
      id: IDS_ORGS.ORG4,
      codigo: 'BR004',
      cnpj: '45997418000153',
      nome: 'Associação Verde Amazônia',
    },
  ] as const;

  for (const org of orgsSeed) {
    await prisma.organizacao.upsert({
      where: { cnpj: org.cnpj },
      update: { codigo: org.codigo, nome: org.nome },
      create: {
        id: org.id,
        codigo: org.codigo,
        cnpj: org.cnpj,
        nome: org.nome,
      },
    });
  }

  // 4. Contratos (2 organizações com contrato, 2 sem contrato)
  const contratosSeed = [
    {
      id: '30000000-0000-0000-0000-000000000001',
      organizacaoId: IDS_ORGS.ORG1,
      numero: 'CT-2026-0001',
      clausulas: { slaTriagemHoras: 48, destinacaoCertificada: true },
      inicio: new Date('2026-01-01T00:00:00.000Z'),
      fim: new Date('2027-12-31T00:00:00.000Z'),
    },
    {
      id: '30000000-0000-0000-0000-000000000002',
      organizacaoId: IDS_ORGS.ORG3,
      numero: 'CT-2026-0002',
      clausulas: { coletaMinimaKg: 250, transporteSegurado: true },
      inicio: new Date('2026-02-01T00:00:00.000Z'),
      fim: null,
    },
  ] as const;

  for (const ct of contratosSeed) {
    await prisma.contrato.upsert({
      where: { organizacaoId: ct.organizacaoId },
      update: {
        numero: ct.numero,
        clausulas: ct.clausulas,
        inicio: ct.inicio,
        fim: ct.fim,
      },
      create: {
        id: ct.id,
        organizacaoId: ct.organizacaoId,
        numero: ct.numero,
        clausulas: ct.clausulas,
        inicio: ct.inicio,
        fim: ct.fim,
      },
    });
  }

  // 5. Lotes (incluindo um lote com exatamente 90 dias de idade)
  const IDS_LOTES = {
    LOTE_HOJE: '40000000-0000-0000-0000-000000000001',
    LOTE_15D: '40000000-0000-0000-0000-000000000002',
    LOTE_90D: '40000000-0000-0000-0000-000000000003',
  } as const;

  const lotesSeed = [
    {
      id: IDS_LOTES.LOTE_HOJE,
      organizacaoId: IDS_ORGS.ORG1,
      notaFiscal: 'NF-SEED-001',
      transportadora: 'Expresso Reverso Ltda',
      dataEntrada: obterDataPassadaNoFuso(0),
    },
    {
      id: IDS_LOTES.LOTE_15D,
      organizacaoId: IDS_ORGS.ORG2,
      notaFiscal: 'NF-SEED-002',
      transportadora: 'LogVerde Transportes',
      dataEntrada: obterDataPassadaNoFuso(15),
    },
    {
      id: IDS_LOTES.LOTE_90D,
      organizacaoId: IDS_ORGS.ORG3,
      notaFiscal: 'NF-SEED-90DIAS',
      transportadora: 'TransEco Brasil',
      dataEntrada: obterDataPassadaNoFuso(90),
    },
  ] as const;

  for (const l of lotesSeed) {
    await prisma.lote.upsert({
      where: { id: l.id },
      update: {
        notaFiscal: l.notaFiscal,
        transportadora: l.transportadora,
        dataEntrada: l.dataEntrada,
      },
      create: l,
    });
  }

  // 6. Equipamentos cobrindo TODOS os 6 status e TODOS os 5 estados físicos
  const IDS_EQ = {
    EQ_RECEBIDO: '50000000-0000-0000-0000-000000000001',
    EQ_EM_TRIAGEM: '50000000-0000-0000-0000-000000000002',
    EQ_TRIADO: '50000000-0000-0000-0000-000000000003',
    EQ_EM_DESMONTE: '50000000-0000-0000-0000-000000000004',
    EQ_DESMONTADO: '50000000-0000-0000-0000-000000000005',
    EQ_DESTINADO: '50000000-0000-0000-0000-000000000006',
    EQ_SEM_VALOR: '50000000-0000-0000-0000-000000000007',
  } as const;

  const equipamentosSeed = [
    {
      // RECEBIDO + EXCELENTE (pronto para tentar desmonte sem triagem em cenário de validação)
      id: IDS_EQ.EQ_RECEBIDO,
      loteId: IDS_LOTES.LOTE_HOJE,
      codigoBarrasInterno: 'GC-000001',
      tipo: TipoEquipamento.NOTEBOOK,
      descricao: 'Notebook Dell Latitude 7420 (Recebido sem triagem)',
      valorAquisicao: '4200.00',
      estadoFisico: EstadoFisico.EXCELENTE,
      status: StatusEquipamento.RECEBIDO,
      triagemCompleta: false,
      classificacaoDestino: null,
    },
    {
      // EM_TRIAGEM + BOM (pronto para endpoint POST /equipamentos/:id/triagem)
      id: IDS_EQ.EQ_EM_TRIAGEM,
      loteId: IDS_LOTES.LOTE_HOJE,
      codigoBarrasInterno: 'GC-000002',
      tipo: TipoEquipamento.DESKTOP,
      descricao: 'Desktop HP EliteDesk 800 G6 (Em Triagem)',
      valorAquisicao: '3100.00',
      estadoFisico: EstadoFisico.BOM,
      status: StatusEquipamento.EM_TRIAGEM,
      triagemCompleta: false,
      classificacaoDestino: null,
    },
    {
      // TRIADO + REGULAR
      id: IDS_EQ.EQ_TRIADO,
      loteId: IDS_LOTES.LOTE_15D,
      codigoBarrasInterno: 'GC-000003',
      tipo: TipoEquipamento.MONITOR,
      descricao: 'Monitor Dell P2422H 24 pol (Triado para Reutilização)',
      valorAquisicao: '1150.00',
      estadoFisico: EstadoFisico.REGULAR,
      status: StatusEquipamento.TRIADO,
      triagemCompleta: true,
      classificacaoDestino: ClassificacaoDestino.REUTILIZACAO,
    },
    {
      // EM_DESMONTE + RUIM (sofreu queda de 2 níveis BOM -> RUIM com justificativa)
      id: IDS_EQ.EQ_EM_DESMONTE,
      loteId: IDS_LOTES.LOTE_15D,
      codigoBarrasInterno: 'GC-000004',
      tipo: TipoEquipamento.SERVIDOR,
      descricao: 'Servidor PowerEdge R740 (Em Desmonte após queda de estado)',
      valorAquisicao: '18500.00',
      estadoFisico: EstadoFisico.RUIM,
      status: StatusEquipamento.EM_DESMONTE,
      triagemCompleta: true,
      classificacaoDestino: ClassificacaoDestino.RECICLAGEM,
    },
    {
      // DESMONTADO + SUCATA
      id: IDS_EQ.EQ_DESMONTADO,
      loteId: IDS_LOTES.LOTE_90D,
      codigoBarrasInterno: 'GC-000005',
      tipo: TipoEquipamento.REDE,
      descricao: 'Switch Cisco Catalyst 2960 (Desmontado em Sucata)',
      valorAquisicao: '2800.00',
      estadoFisico: EstadoFisico.SUCATA,
      status: StatusEquipamento.DESMONTADO,
      triagemCompleta: true,
      classificacaoDestino: ClassificacaoDestino.RECICLAGEM,
    },
    {
      // DESTINADO + SUCATA
      id: IDS_EQ.EQ_DESTINADO,
      loteId: IDS_LOTES.LOTE_90D,
      codigoBarrasInterno: 'GC-000006',
      tipo: TipoEquipamento.OUTRO,
      descricao: 'Bateria Estacionária Nobreak (Destinada para Descarte Seguro)',
      valorAquisicao: '950.00',
      estadoFisico: EstadoFisico.SUCATA,
      status: StatusEquipamento.DESTINADO,
      triagemCompleta: true,
      classificacaoDestino: ClassificacaoDestino.DESCARTE_SEGURO,
    },
    {
      // Equipamento sem valorAquisicao (exercita R8: contado à parte no relatório financeiro)
      id: IDS_EQ.EQ_SEM_VALOR,
      loteId: IDS_LOTES.LOTE_HOJE,
      codigoBarrasInterno: 'GC-000007',
      tipo: TipoEquipamento.PERIFERICO,
      descricao: 'Lote de Teclados USB Doação Sem Nota de Aquisição',
      valorAquisicao: null,
      estadoFisico: EstadoFisico.REGULAR,
      status: StatusEquipamento.RECEBIDO,
      triagemCompleta: false,
      classificacaoDestino: null,
    },
  ] as const;

  for (const eq of equipamentosSeed) {
    await prisma.equipamento.upsert({
      where: { codigoBarrasInterno: eq.codigoBarrasInterno },
      update: {
        descricao: eq.descricao,
        valorAquisicao: eq.valorAquisicao,
        estadoFisico: eq.estadoFisico,
        status: eq.status,
        triagemCompleta: eq.triagemCompleta,
        classificacaoDestino: eq.classificacaoDestino,
      },
      create: eq,
    });
  }

  // Avança a sequence seq_codigo_barras para pelo menos 10 para não colidir com GC-000001..GC-000007
  await prisma.$executeRawUnsafe(
    `SELECT setval('seq_codigo_barras', GREATEST((SELECT last_value FROM seq_codigo_barras), 10));`,
  );

  // 7. Movimentações históricas imutáveis (inseridas apenas se ainda não existirem pelo ID fixo)
  const movimentacoesSeed = [
    {
      id: '60000000-0000-0000-0000-000000000001',
      equipamentoId: IDS_EQ.EQ_EM_TRIAGEM,
      statusAnterior: StatusEquipamento.RECEBIDO,
      statusNovo: StatusEquipamento.EM_TRIAGEM,
      estadoAnterior: EstadoFisico.BOM,
      estadoNovo: EstadoFisico.BOM,
      justificativa: null,
      usuarioId: IDS_USUARIOS.GESTOR,
    },
    {
      id: '60000000-0000-0000-0000-000000000002',
      equipamentoId: IDS_EQ.EQ_EM_DESMONTE,
      statusAnterior: StatusEquipamento.TRIADO,
      statusNovo: StatusEquipamento.EM_DESMONTE,
      estadoAnterior: EstadoFisico.BOM,
      estadoNovo: EstadoFisico.RUIM,
      justificativa: 'Queda de 2 níveis após constatação de corrosão severa nas fontes redundantes.',
      usuarioId: IDS_USUARIOS.GESTOR,
    },
  ] as const;

  for (const mov of movimentacoesSeed) {
    const jaExiste = await prisma.movimentacao.findUnique({ where: { id: mov.id } });
    if (!jaExiste) {
      await prisma.movimentacao.create({
        data: {
          ...mov,
          versao: 1,
        },
      });
    }
  }

  // 8. Registros de Auditoria coerentes (inseridos apenas se ainda não existirem pelo ID fixo)
  const auditoriasSeed = [
    {
      id: '70000000-0000-0000-0000-000000000001',
      usuarioId: IDS_USUARIOS.ADMIN,
      acao: 'SEED_INICIAL',
      entidade: 'Sistema',
      entidadeId: 'seed-v1',
      depois: { descricao: 'Carga inicial representativa idempotente' },
    },
    {
      id: '70000000-0000-0000-0000-000000000002',
      usuarioId: IDS_USUARIOS.GESTOR,
      acao: 'MOVIMENTAR',
      entidade: 'Equipamento',
      entidadeId: IDS_EQ.EQ_EM_DESMONTE,
      antes: { status: StatusEquipamento.TRIADO, estadoFisico: EstadoFisico.BOM },
      depois: { status: StatusEquipamento.EM_DESMONTE, estadoFisico: EstadoFisico.RUIM },
    },
  ] as const;

  for (const aud of auditoriasSeed) {
    const jaExiste = await prisma.auditoria.findUnique({ where: { id: aud.id } });
    if (!jaExiste) {
      await prisma.auditoria.create({
        data: {
          id: aud.id,
          usuarioId: aud.usuarioId,
          acao: aud.acao,
          entidade: aud.entidade,
          entidadeId: aud.entidadeId,
          ...('antes' in aud && aud.antes !== undefined ? { antes: aud.antes } : {}),
          depois: aud.depois,
        },
      });
    }
  }

  const [
    usuarios,
    parametros,
    organizacoes,
    contratos,
    lotes,
    equipamentos,
    movimentacoes,
    auditorias,
  ] = await Promise.all([
    prisma.usuario.count(),
    prisma.parametro.count(),
    prisma.organizacao.count(),
    prisma.contrato.count(),
    prisma.lote.count(),
    prisma.equipamento.count(),
    prisma.movimentacao.count(),
    prisma.auditoria.count(),
  ]);

  return {
    usuarios,
    parametros,
    organizacoes,
    contratos,
    lotes,
    equipamentos,
    movimentacoes,
    auditorias,
  };
}

const executandoDiretamente =
  process.argv[1] !== undefined && process.argv[1].endsWith('seed.ts');

if (executandoDiretamente) {
  executarSeed()
    .then((resumo) => {
      process.stdout.write(
        `✔ Seed concluído com sucesso: ${JSON.stringify(resumo)}\n`,
      );
      return prisma.$disconnect();
    })
    .catch(async (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`✘ Falha ao executar seed: ${msg}\n`);
      await prisma.$disconnect();
      process.exit(1);
    });
}
