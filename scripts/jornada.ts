import 'dotenv/config';
import {
  ClassificacaoDestino,
  EstadoFisico,
  Papel,
  StatusEquipamento,
  TipoEquipamento,
} from '../src/domain/index.js';
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

function gerarCnpjAlfanumericoValido(sufixo6Digitos: string): string {
  const base12 = `JR${sufixo6Digitos}0001`.padEnd(12, '0').slice(0, 12);
  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const calc = (b: string, p: number[]): number => {
    let s = 0;
    for (let i = 0; i < p.length; i++) {
      s += (b.charCodeAt(i) - 48) * (p[i] ?? 0);
    }
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const dv1 = calc(base12, pesos1);
  const dv2 = calc(`${base12}${dv1}`, pesos2);
  return `${base12}${dv1}${dv2}`;
}

/**
 * Script de jornada completa ponta a ponta contra o servidor HTTP real em execução (A1-22, seção 14):
 * - Segue estritamente a matriz de permissões da seção 9:
 *   - ADMIN: provisionamento, usuários e parâmetros
 *   - OPERADOR_CADASTRO: organização e contrato
 *   - GESTOR_ALMOXARIFADO: lote, equipamento, EM_TRIAGEM, triagem (TRIADO), EM_DESMONTE, DESMONTADO, DESTINADO
 *   - AUDITOR: rastreabilidade e relatórios (resumo e financeiro)
 * - Executa também os 3 cenários de falha esperados:
 *   1. CNPJ inválido (422)
 *   2. Desmonte sem triagem / pulo de etapa (422)
 *   3. AUDITOR tentando escrever (403)
 */
export async function executarJornada(
  baseUrlInput?: string | undefined,
): Promise<{ passosExecutados: number; falhas: number }> {
  const porta = process.env['PORT'] ?? '3000';
  const baseUrl = (
    baseUrlInput ??
    process.env['JORNADA_URL'] ??
    `http://127.0.0.1:${porta}`
  ).replace(/\/$/, '');

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

  const sufixo = String(Date.now()).slice(-6);
  const emailAdmin = `admin.jornada.${sufixo}@greencode.com.br`;
  const emailOperador = `operador.jornada.${sufixo}@greencode.com.br`;
  const emailGestor = `gestor.jornada.${sufixo}@greencode.com.br`;
  const emailAuditor = `auditor.jornada.${sufixo}@greencode.com.br`;
  const senhaPadrao = 'JornadaForte2026';

  let tokenAdmin = '';
  let tokenOperador = '';
  let tokenGestor = '';
  let tokenAuditor = '';

  let orgId = '';
  const orgCodigo = `JR${sufixo}`;
  let loteId = '';
  let eqPrincipalId = '';
  let eqSemTriagemId = '';

  // 1. Provisionar administrador inicial
  await passo('Provisionar administrador inicial (criar-admin)', async () => {
    const res = await executarProvisionamentoAdmin({
      email: emailAdmin,
      senha: senhaPadrao,
    });
    if (!res.id) {
      throw new Error('ID do administrador não retornado no provisionamento.');
    }
  });

  // 2. Login como ADMIN e configuração de usuários por papel (OPERADOR_CADASTRO, GESTOR_ALMOXARIFADO, AUDITOR) + parâmetros
  await passo(
    'Login como ADMIN e criação de contas OPERADOR_CADASTRO, GESTOR_ALMOXARIFADO e AUDITOR',
    async () => {
      const loginAdmin = await requisitar<{ token: string }>(
        baseUrl,
        'POST',
        '/api/v1/auth/login',
        {
          body: { email: emailAdmin, senha: senhaPadrao },
        },
      );
      if (loginAdmin.status !== 200 || !loginAdmin.body.token) {
        throw new Error(`Esperado 200 no login ADMIN, recebido ${loginAdmin.status}`);
      }
      tokenAdmin = loginAdmin.body.token;

      await requisitar(baseUrl, 'PUT', '/api/v1/parametros', {
        token: tokenAdmin,
        body: {
          parametros: [
            { chave: 'ALIQUOTA_IMPOSTO', valor: '0.12' },
            { chave: 'COEF_DEPRECIACAO_NOTEBOOK', valor: '0.35' },
            { chave: 'COEF_DEPRECIACAO_DESKTOP', valor: '0.40' },
          ],
        },
      });

      const contas = [
        { email: emailOperador, papel: Papel.OPERADOR_CADASTRO },
        { email: emailGestor, papel: Papel.GESTOR_ALMOXARIFADO },
        { email: emailAuditor, papel: Papel.AUDITOR },
      ] as const;

      for (const conta of contas) {
        const criacao = await requisitar(baseUrl, 'POST', '/api/v1/usuarios', {
          token: tokenAdmin,
          body: {
            email: conta.email,
            senha: senhaPadrao,
            papel: conta.papel,
          },
        });
        if (criacao.status !== 201) {
          throw new Error(
            `Esperado 201 ao criar usuário ${conta.papel}, recebido ${criacao.status}`,
          );
        }
      }

      const [resOp, resGe, resAu] = await Promise.all([
        requisitar<{ token: string }>(baseUrl, 'POST', '/api/v1/auth/login', {
          body: { email: emailOperador, senha: senhaPadrao },
        }),
        requisitar<{ token: string }>(baseUrl, 'POST', '/api/v1/auth/login', {
          body: { email: emailGestor, senha: senhaPadrao },
        }),
        requisitar<{ token: string }>(baseUrl, 'POST', '/api/v1/auth/login', {
          body: { email: emailAuditor, senha: senhaPadrao },
        }),
      ]);

      if (resOp.status !== 200 || resGe.status !== 200 || resAu.status !== 200) {
        throw new Error('Falha ao autenticar os papéis criados.');
      }
      tokenOperador = resOp.body.token;
      tokenGestor = resGe.body.token;
      tokenAuditor = resAu.body.token;
    },
  );

  // 3. OPERADOR_CADASTRO cria organização cliente
  await passo(
    'OPERADOR_CADASTRO cria organização cliente (POST /api/v1/organizacoes)',
    async () => {
      const cnpjUnico = gerarCnpjAlfanumericoValido(sufixo);
      const res = await requisitar<{ id: string; cnpj: string }>(
        baseUrl,
        'POST',
        '/api/v1/organizacoes',
        {
          token: tokenOperador,
          body: {
            codigo: orgCodigo,
            cnpj: cnpjUnico,
            nome: `Organização Cliente Jornada ${sufixo}`,
          },
        },
      );
      if (res.status !== 201 || !res.body.id) {
        throw new Error(`Esperado 201, recebido ${res.status}: ${JSON.stringify(res.body)}`);
      }
      orgId = res.body.id;
    },
  );

  // 4. OPERADOR_CADASTRO cria contrato de coleta da organização
  await passo(
    'OPERADOR_CADASTRO registra contrato da organização (POST /api/v1/organizacoes/:id/contrato)',
    async () => {
      const res = await requisitar(baseUrl, 'POST', `/api/v1/organizacoes/${orgId}/contrato`, {
        token: tokenOperador,
        body: {
          numero: `CT-JR-${sufixo}`,
          clausulas: { slaHoras: 24, coletaSegurada: true },
          inicio: '2026-01-01',
          fim: '2027-01-01',
        },
      });
      if (res.status !== 201) {
        throw new Error(`Esperado 201 ao criar contrato, recebido ${res.status}`);
      }
    },
  );

  // 5. GESTOR_ALMOXARIFADO cria lote com equipamentos (validando formato GC-000001 de R6)
  await passo(
    'GESTOR_ALMOXARIFADO cria lote com equipamentos (POST /api/v1/lotes -> códigos GC-XXXXXX e status RECEBIDO)',
    async () => {
      const res = await requisitar<{
        id: string;
        equipamentos: Array<{ id: string; codigoBarrasInterno: string; status: string }>;
      }>(baseUrl, 'POST', '/api/v1/lotes', {
        token: tokenGestor,
        body: {
          orgCodigo,
          notaFiscal: `NF-JR-${sufixo}`,
          transportadora: 'Transportadora Logística Reversa S.A.',
          dataEntrada: obterHojeFormatado(),
          equipamentos: [
            {
              tipo: TipoEquipamento.NOTEBOOK,
              descricao: 'Notebook Corporativo Jornada Principal',
              estadoFisico: EstadoFisico.EXCELENTE,
              valorAquisicao: '3200.00',
            },
            {
              tipo: TipoEquipamento.DESKTOP,
              descricao: 'Desktop Reserva Sem Triagem',
              estadoFisico: EstadoFisico.BOM,
              valorAquisicao: '1800.00',
            },
          ],
        },
      });

      if (res.status !== 201 || res.body.equipamentos.length !== 2) {
        throw new Error(`Esperado 201 com 2 equipamentos, recebido ${res.status}`);
      }

      loteId = res.body.id;
      const eq1 = res.body.equipamentos[0];
      const eq2 = res.body.equipamentos[1];
      if (!eq1 || !eq2) {
        throw new Error('Equipamentos não retornados na criação do lote.');
      }
      if (!/^GC-\d{6,}$/.test(eq1.codigoBarrasInterno) || eq1.status !== StatusEquipamento.RECEBIDO) {
        throw new Error(
          `Formato de código de barras ou status inválido: ${eq1.codigoBarrasInterno} (${eq1.status})`,
        );
      }
      eqPrincipalId = eq1.id;
      eqSemTriagemId = eq2.id;
      void loteId;
    },
  );

  // 6. GESTOR_ALMOXARIFADO move equipamento de RECEBIDO para EM_TRIAGEM
  await passo(
    'GESTOR_ALMOXARIFADO movimenta equipamento RECEBIDO -> EM_TRIAGEM (POST /api/v1/equipamentos/:id/movimentacoes)',
    async () => {
      const res = await requisitar<{ equipamento: { status: string; versao: number } }>(
        baseUrl,
        'POST',
        `/api/v1/equipamentos/${eqPrincipalId}/movimentacoes`,
        {
          token: tokenGestor,
          body: {
            versao: 1,
            statusNovo: StatusEquipamento.EM_TRIAGEM,
          },
        },
      );
      if (res.status !== 200 || res.body.equipamento.status !== StatusEquipamento.EM_TRIAGEM) {
        throw new Error(`Esperado 200 com status EM_TRIAGEM, recebido ${res.status}`);
      }
    },
  );

  // 7. GESTOR_ALMOXARIFADO executa triagem (R9: exige EM_TRIAGEM, define triagemCompleta=true e move para TRIADO)
  await passo(
    'GESTOR_ALMOXARIFADO realiza triagem (POST /api/v1/equipamentos/:id/triagem -> status TRIADO, triagemCompleta=true, destino REUTILIZACAO)',
    async () => {
      const res = await requisitar<{
        status: string;
        triagemCompleta: boolean;
        classificacaoDestino: string;
        versao: number;
      }>(baseUrl, 'POST', `/api/v1/equipamentos/${eqPrincipalId}/triagem`, {
        token: tokenGestor,
        body: {
          versao: 2,
          classificacaoDestino: ClassificacaoDestino.REUTILIZACAO,
          estadoFisico: EstadoFisico.BOM,
        },
      });
      if (
        res.status !== 200 ||
        res.body.status !== StatusEquipamento.TRIADO ||
        res.body.triagemCompleta !== true ||
        res.body.classificacaoDestino !== ClassificacaoDestino.REUTILIZACAO
      ) {
        throw new Error(
          `Esperado 200 com status=TRIADO e triagemCompleta=true, recebido ${res.status}: ${JSON.stringify(res.body)}`,
        );
      }
    },
  );

  // 8. GESTOR_ALMOXARIFADO move equipamento de TRIADO para EM_DESMONTE
  await passo(
    'GESTOR_ALMOXARIFADO movimenta equipamento TRIADO -> EM_DESMONTE (POST /api/v1/equipamentos/:id/movimentacoes)',
    async () => {
      const res = await requisitar<{ equipamento: { status: string } }>(
        baseUrl,
        'POST',
        `/api/v1/equipamentos/${eqPrincipalId}/movimentacoes`,
        {
          token: tokenGestor,
          body: {
            versao: 3,
            statusNovo: StatusEquipamento.EM_DESMONTE,
          },
        },
      );
      if (res.status !== 200 || res.body.equipamento.status !== StatusEquipamento.EM_DESMONTE) {
        throw new Error(`Esperado 200 com status EM_DESMONTE, recebido ${res.status}`);
      }
    },
  );

  // 9. GESTOR_ALMOXARIFADO move equipamento de EM_DESMONTE para DESMONTADO (com queda de estado físico e justificativa R4)
  await passo(
    'GESTOR_ALMOXARIFADO movimenta equipamento EM_DESMONTE -> DESMONTADO com justificativa (R4)',
    async () => {
      const res = await requisitar<{ equipamento: { status: string; estadoFisico: string } }>(
        baseUrl,
        'POST',
        `/api/v1/equipamentos/${eqPrincipalId}/movimentacoes`,
        {
          token: tokenGestor,
          body: {
            versao: 4,
            statusNovo: StatusEquipamento.DESMONTADO,
            estadoNovo: EstadoFisico.SUCATA,
            justificativa: 'Desmonte completo de componentes eletrônicos para reaproveitamento.',
          },
        },
      );
      if (res.status !== 200 || res.body.equipamento.status !== StatusEquipamento.DESMONTADO) {
        throw new Error(`Esperado 200 com status DESMONTADO, recebido ${res.status}`);
      }
    },
  );

  // 10. GESTOR_ALMOXARIFADO move equipamento de DESMONTADO para DESTINADO
  await passo(
    'GESTOR_ALMOXARIFADO movimenta equipamento DESMONTADO -> DESTINADO (POST /api/v1/equipamentos/:id/movimentacoes)',
    async () => {
      const res = await requisitar<{ equipamento: { status: string } }>(
        baseUrl,
        'POST',
        `/api/v1/equipamentos/${eqPrincipalId}/movimentacoes`,
        {
          token: tokenGestor,
          body: {
            versao: 5,
            statusNovo: StatusEquipamento.DESTINADO,
          },
        },
      );
      if (res.status !== 200 || res.body.equipamento.status !== StatusEquipamento.DESTINADO) {
        throw new Error(`Esperado 200 com status DESTINADO, recebido ${res.status}`);
      }
    },
  );

  // 11. Consultar rastreabilidade completa do equipamento em ordem cronológica
  await passo(
    'Consultar rastreabilidade completa do equipamento (GET /api/v1/equipamentos/:id/rastreabilidade)',
    async () => {
      const res = await requisitar<{
        equipamento: { status: string };
        movimentacoes: Array<{ statusAnterior: string; statusNovo: string }>;
      }>(baseUrl, 'GET', `/api/v1/equipamentos/${eqPrincipalId}/rastreabilidade`, {
        token: tokenAuditor,
      });
      if (res.status !== 200 || res.body.movimentacoes.length !== 5) {
        throw new Error(
          `Esperado 200 com 5 movimentações cronológicas, recebido ${res.status} (${res.body.movimentacoes.length})`,
        );
      }
    },
  );

  // 12. AUDITOR consulta relatórios resumo e financeiro
  await passo(
    'AUDITOR consulta relatórios resumo e financeiro (GET /api/v1/relatorios/resumo e /financeiro)',
    async () => {
      const resumo = await requisitar<{ totalEquipamentos: number }>(
        baseUrl,
        'GET',
        `/api/v1/relatorios/resumo?organizacaoId=${orgId}`,
        { token: tokenAuditor },
      );
      if (resumo.status !== 200 || resumo.body.totalEquipamentos !== 2) {
        throw new Error(`Esperado 200 no relatório resumo com 2 equipamentos, recebido ${resumo.status}`);
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
    },
  );

  // 13. Falha esperada 1: CNPJ inválido rejeitado com 422
  await passo(
    'Cenário de falha esperado 1: CNPJ inválido rejeitado com 422 (R1)',
    async () => {
      const res = await requisitar<{ erro: string }>(baseUrl, 'POST', '/api/v1/organizacoes', {
        token: tokenOperador,
        body: {
          codigo: `INV${sufixo}`,
          cnpj: '11.222.333/0001-99',
          nome: 'Organização CNPJ Inválido',
        },
      });
      if (res.status !== 422) {
        throw new Error(`Esperado 422 para CNPJ inválido, recebido ${res.status}`);
      }
    },
  );

  // 14. Falha esperada 2: Desmonte sem triagem rejeitado com 422 (R3 e R5)
  await passo(
    'Cenário de falha esperado 2: Desmonte sem triagem rejeitado com 422 (R3/R5)',
    async () => {
      const res = await requisitar(
        baseUrl,
        'POST',
        `/api/v1/equipamentos/${eqSemTriagemId}/movimentacoes`,
        {
          token: tokenGestor,
          body: {
            versao: 1,
            statusNovo: StatusEquipamento.EM_DESMONTE,
          },
        },
      );
      if (res.status !== 422) {
        throw new Error(`Esperado 422 ao tentar desmonte sem triagem, recebido ${res.status}`);
      }
    },
  );

  // 15. Falha esperada 3: AUDITOR tentando escrever bloqueado com 403
  await passo(
    'Cenário de falha esperado 3: AUDITOR tentando escrever bloqueado com 403 (A1-05)',
    async () => {
      const res = await requisitar(baseUrl, 'POST', '/api/v1/organizacoes', {
        token: tokenAuditor,
        body: {
          codigo: `AUD${sufixo}`,
          cnpj: '11.222.333/0001-81',
          nome: 'Tentativa Escrita Auditor',
        },
      });
      if (res.status !== 403) {
        throw new Error(`Esperado 403 para AUDITOR tentando escrever, recebido ${res.status}`);
      }
    },
  );

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
