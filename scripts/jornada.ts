import 'dotenv/config';
import { Papel } from '../src/domain/index.js';
import { prisma } from '../src/lib/prisma.js';
import { executarProvisionamentoAdmin } from './criar-admin.js';

interface RespostaHttp<T = Record<string, unknown>> {
  status: number;
  body: T;
}

async function requisitar<T = Record<string, unknown>>(
  baseUrl: string,
  metodo: string,
  caminho: string,
  opcoes?: {
    token?: string | undefined;
    body?: unknown;
  },
): Promise<RespostaHttp<T>> {
  const headers: Record<string, string> = {};
  if (opcoes?.token) {
    headers['Authorization'] = `Bearer ${opcoes.token}`;
  }
  if (opcoes?.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const init: RequestInit = {
    method: metodo,
    headers,
    ...(opcoes?.body !== undefined ? { body: JSON.stringify(opcoes.body) } : {}),
  };

  const resp = await fetch(`${baseUrl}${caminho}`, init);
  const texto = await resp.text();
  const body = (texto ? JSON.parse(texto) : {}) as T;
  return { status: resp.status, body };
}

function obterHojeFormatado(): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const ano = partes.find((p) => p.type === 'year')?.value;
  const mes = partes.find((p) => p.type === 'month')?.value;
  const dia = partes.find((p) => p.type === 'day')?.value;
  return `${ano}-${mes}-${dia}`;
}

/**
 * Script de jornada completa ponta a ponta contra o servidor HTTP em execução (A1-22, seção 14).
 */
export async function executarJornada(
  baseUrlInput?: string | undefined,
): Promise<{ passosExecutados: number; falhas: number }> {
  const porta = process.env['PORT'] ?? '3000';
  const baseUrl = (baseUrlInput ?? process.env['JORNADA_URL'] ?? `http://127.0.0.1:${porta}`).replace(
    /\/$/,
    '',
  );

  let passosExecutados = 0;
  let falhas = 0;

  async function passo(nome: string, fn: () => Promise<void>): Promise<void> {
    passosExecutados += 1;
    try {
      await fn();
      process.stdout.write(`✔ [${passosExecutados}] ${nome}\n`);
    } catch (err) {
      falhas += 1;
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`✘ [${passosExecutados}] ${nome} — ${msg}\n`);
      throw err;
    }
  }

  const sufixoUnico = String(Date.now()).slice(-6);
  const emailAdmin = `admin.jornada.${sufixoUnico}@greencode.com.br`;
  const senhaAdmin = 'JornadaForte2026';
  let tokenAdmin = '';
  let tokenAuditor = '';
  let orgId = '';
  const orgCodigo = `JR${sufixoUnico}`;
  let eqPrincipalId = '';
  let eqSemTriagemId = '';

  // 1. Provisionar/obter admin
  await passo('Provisionar administrador inicial', async () => {
    const res = await executarProvisionamentoAdmin({
      email: emailAdmin,
      senha: senhaAdmin,
    });
    if (!res.id) throw new Error('ID do admin não retornado');
  });

  // 2. Login do ADMIN
  await passo('Login como ADMIN (POST /api/v1/auth/login)', async () => {
    const res = await requisitar<{ token: string }>(baseUrl, 'POST', '/api/v1/auth/login', {
      body: { email: emailAdmin, senha: senhaAdmin },
    });
    if (res.status !== 200 || !res.body.token) {
      throw new Error(`Esperado 200 com token, recebido ${res.status}`);
    }
    tokenAdmin = res.body.token;
  });

  // 3. Criar usuário AUDITOR e obter token para testar matriz RBAC
  await passo('Criar usuário AUDITOR e autenticar', async () => {
    const emailAuditor = `auditor.jornada.${sufixoUnico}@greencode.com.br`;
    const criacao = await requisitar(baseUrl, 'POST', '/api/v1/usuarios', {
      token: tokenAdmin,
      body: {
        email: emailAuditor,
        senha: 'AuditorForte2026',
        papel: Papel.AUDITOR,
      },
    });
    if (criacao.status !== 201) {
      throw new Error(`Esperado 201 na criação do auditor, recebido ${criacao.status}`);
    }
    const loginAud = await requisitar<{ token: string }>(baseUrl, 'POST', '/api/v1/auth/login', {
      body: { email: emailAuditor, senha: 'AuditorForte2026' },
    });
    if (loginAud.status !== 200) {
      throw new Error(`Falha no login do auditor: ${loginAud.status}`);
    }
    tokenAuditor = loginAud.body.token;
  });

  // 4. Criar organização (usando CNPJ alfanumérico calculado dinamicamente para ser único)
  await passo('Criar organização parceira (POST /api/v1/organizacoes)', async () => {
    // Calcula DV Módulo 11 (ASCII - 48) para base de 12 chars única
    const base12 = `JR${sufixoUnico}0001`.padEnd(12, '0').slice(0, 12);
    const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const calc = (b: string, p: number[]) => {
      let s = 0;
      for (let i = 0; i < p.length; i++) s += (b.charCodeAt(i) - 48) * (p[i] ?? 0);
      const r = s % 11;
      return r < 2 ? 0 : 11 - r;
    };
    const dv1 = calc(base12, pesos1);
    const dv2 = calc(`${base12}${dv1}`, pesos2);
    const cnpjUnico = `${base12}${dv1}${dv2}`;

    const res = await requisitar<{ id: string }>(baseUrl, 'POST', '/api/v1/organizacoes', {
      token: tokenAdmin,
      body: {
        codigo: orgCodigo,
        cnpj: cnpjUnico,
        nome: `Organização Jornada ${sufixoUnico}`,
      },
    });
    if (res.status !== 201 || !res.body.id) {
      throw new Error(`Esperado 201, recebido ${res.status}: ${JSON.stringify(res.body)}`);
    }
    orgId = res.body.id;
  });

  // 5. Criar contrato
  await passo('Criar contrato da organização (POST /api/v1/organizacoes/:id/contrato)', async () => {
    const res = await requisitar(baseUrl, 'POST', `/api/v1/organizacoes/${orgId}/contrato`, {
      token: tokenAdmin,
      body: {
        numero: `CT-JR-${sufixoUnico}`,
        clausulas: { slaHoras: 24 },
        inicio: '2026-01-01',
        fim: '2027-01-01',
      },
    });
    if (res.status !== 201) {
      throw new Error(`Esperado 201, recebido ${res.status}`);
    }
  });

  // 6. Criar lote com 2 equipamentos
  await passo('Criar lote com equipamentos (POST /api/v1/lotes)', async () => {
    const res = await requisitar<{ equipamentos: Array<{ id: string }> }>(
      baseUrl,
      'POST',
      '/api/v1/lotes',
      {
        token: tokenAdmin,
        body: {
          orgCodigo,
          notaFiscal: `NF-JR-${sufixoUnico}`,
          transportadora: 'Transportadora Jornada Verde',
          dataEntrada: obterHojeFormatado(),
          equipamentos: [
            {
              tipo: 'NOTEBOOK',
              descricao: 'Notebook Jornada Principal',
              estadoFisico: 'EXCELENTE',
              valorAquisicao: '3200.00',
            },
            {
              tipo: 'DESKTOP',
              descricao: 'Desktop Sem Triagem Para Teste de Falha',
              estadoFisico: 'BOM',
              valorAquisicao: '1800.00',
            },
          ],
        },
      },
    );
    if (res.status !== 201 || res.body.equipamentos.length !== 2) {
      throw new Error(`Esperado 201 com 2 equipamentos, recebido ${res.status}`);
    }
    eqPrincipalId = res.body.equipamentos[0]?.id ?? '';
    eqSemTriagemId = res.body.equipamentos[1]?.id ?? '';
  });

  // 7. Movimentar para EM_TRIAGEM e realizar Triagem (R9 -> TRIADO)
  await passo('Mover para EM_TRIAGEM e concluir Triagem (POST /api/v1/equipamentos/:id/triagem)', async () => {
    const mov1 = await requisitar(
      baseUrl,
      'POST',
      `/api/v1/equipamentos/${eqPrincipalId}/movimentacoes`,
      {
        token: tokenAdmin,
        body: { versao: 1, statusNovo: 'EM_TRIAGEM' },
      },
    );
    if (mov1.status !== 200) throw new Error(`Falha ao mover para EM_TRIAGEM: ${mov1.status}`);

    const triagem = await requisitar<{ status: string; triagemCompleta: boolean }>(
      baseUrl,
      'POST',
      `/api/v1/equipamentos/${eqPrincipalId}/triagem`,
      {
        token: tokenAdmin,
        body: {
          versao: 2,
          classificacaoDestino: 'RECICLAGEM',
          estadoFisico: 'BOM',
        },
      },
    );
    if (triagem.status !== 200 || triagem.body.status !== 'TRIADO' || !triagem.body.triagemCompleta) {
      throw new Error(`Falha na triagem: ${triagem.status}`);
    }
  });

  // 8. Desmonte -> Desmontado -> Destinado
  await passo('Executar movimentações: EM_DESMONTE -> DESMONTADO (com justificativa R4) -> DESTINADO', async () => {
    const mDesmonte = await requisitar(
      baseUrl,
      'POST',
      `/api/v1/equipamentos/${eqPrincipalId}/movimentacoes`,
      {
        token: tokenAdmin,
        body: { versao: 3, statusNovo: 'EM_DESMONTE' },
      },
    );
    if (mDesmonte.status !== 200) throw new Error(`Falha EM_DESMONTE: ${mDesmonte.status}`);

    const mDesmontado = await requisitar(
      baseUrl,
      'POST',
      `/api/v1/equipamentos/${eqPrincipalId}/movimentacoes`,
      {
        token: tokenAdmin,
        body: {
          versao: 4,
          statusNovo: 'DESMONTADO',
          estadoNovo: 'SUCATA',
          justificativa: 'Desmonte completo de componentes eletrônicos para reciclagem.',
        },
      },
    );
    if (mDesmontado.status !== 200) throw new Error(`Falha DESMONTADO: ${mDesmontado.status}`);

    const mDestinado = await requisitar<{ equipamento: { status: string } }>(
      baseUrl,
      'POST',
      `/api/v1/equipamentos/${eqPrincipalId}/movimentacoes`,
      {
        token: tokenAdmin,
        body: { versao: 5, statusNovo: 'DESTINADO' },
      },
    );
    if (mDestinado.status !== 200 || mDestinado.body.equipamento.status !== 'DESTINADO') {
      throw new Error(`Falha DESTINADO: ${mDestinado.status}`);
    }
  });

  // 9. Consultar Rastreabilidade
  await passo('Consultar rastreabilidade completa (GET /api/v1/equipamentos/:id/rastreabilidade)', async () => {
    const rastro = await requisitar<{ movimentacoes: unknown[] }>(
      baseUrl,
      'GET',
      `/api/v1/equipamentos/${eqPrincipalId}/rastreabilidade`,
      { token: tokenAuditor },
    );
    if (rastro.status !== 200 || rastro.body.movimentacoes.length !== 5) {
      throw new Error(
        `Esperado 200 com 5 movimentações na linha do tempo, recebido ${rastro.status} (${rastro.body.movimentacoes.length})`,
      );
    }
  });

  // 10. Consultar Relatórios (Resumo e Financeiro)
  await passo('Consultar relatórios resumo e financeiro (GET /api/v1/relatorios/*)', async () => {
    const resumo = await requisitar<{ totalEquipamentos: number }>(
      baseUrl,
      'GET',
      `/api/v1/relatorios/resumo?organizacaoId=${orgId}`,
      { token: tokenAuditor },
    );
    if (resumo.status !== 200 || resumo.body.totalEquipamentos !== 2) {
      throw new Error(`Falha no relatório resumo: ${resumo.status}`);
    }

    const fin = await requisitar<{ somaValorAquisicao: string }>(
      baseUrl,
      'GET',
      `/api/v1/relatorios/financeiro?organizacaoId=${orgId}`,
      { token: tokenAuditor },
    );
    if (fin.status !== 200 || fin.body.somaValorAquisicao !== '5000.00') {
      throw new Error(`Falha no relatório financeiro: ${JSON.stringify(fin.body)}`);
    }
  });

  // 11. Cenário de falha esperado 1: CNPJ inválido -> 422
  await passo('Cenário de falha esperado 1: CNPJ inválido rejeitado com 422', async () => {
    const res = await requisitar<{ erro: string }>(baseUrl, 'POST', '/api/v1/organizacoes', {
      token: tokenAdmin,
      body: {
        codigo: `INV${sufixoUnico}`,
        cnpj: '11.222.333/0001-99',
        nome: 'Org CNPJ Inválido',
      },
    });
    if (res.status !== 422 || res.body.erro !== 'CNPJ_INVALIDO') {
      throw new Error(`Esperado 422 CNPJ_INVALIDO, recebido ${res.status}`);
    }
  });

  // 12. Cenário de falha esperado 2: Desmonte sem triagem -> 422
  await passo('Cenário de falha esperado 2: Desmonte sem triagem rejeitado com 422 (R3/R5)', async () => {
    const res = await requisitar(
      baseUrl,
      'POST',
      `/api/v1/equipamentos/${eqSemTriagemId}/movimentacoes`,
      {
        token: tokenAdmin,
        body: { versao: 1, statusNovo: 'EM_DESMONTE' },
      },
    );
    if (res.status !== 422) {
      throw new Error(`Esperado 422 ao tentar desmonte sem triagem, recebido ${res.status}`);
    }
  });

  // 13. Cenário de falha esperado 3: AUDITOR tentando escrever -> 403
  await passo('Cenário de falha esperado 3: AUDITOR tentando escrever bloqueado com 403', async () => {
    const res = await requisitar(baseUrl, 'POST', '/api/v1/organizacoes', {
      token: tokenAuditor,
      body: {
        codigo: `AUD${sufixoUnico}`,
        cnpj: '11.222.333/0001-81',
        nome: 'Tentativa Escrita Auditor',
      },
    });
    if (res.status !== 403) {
      throw new Error(`Esperado 403 para AUDITOR escrevendo, recebido ${res.status}`);
    }
  });

  return { passosExecutados, falhas };
}

const executandoDiretamente =
  process.argv[1] !== undefined && process.argv[1].endsWith('jornada.ts');

if (executandoDiretamente) {
  executarJornada()
    .then(async ({ passosExecutados }) => {
      process.stdout.write(
        `\n✔ Jornada completa concluída com sucesso (${passosExecutados}/${passosExecutados} passos verificados).\n`,
      );
      await prisma.$disconnect();
    })
    .catch(async () => {
      process.stderr.write('\n✘ Jornada encerrada com falha.\n');
      await prisma.$disconnect();
      process.exit(1);
    });
}
