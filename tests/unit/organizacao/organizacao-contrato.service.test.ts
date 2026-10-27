import { beforeEach, describe, expect, it } from 'vitest';
import {
  ErroConflito,
  ErroConflitoDeVersao,
  ErroNaoEncontrado,
  ErroRegraDeNegocio,
  ErroSemPermissao,
  Papel,
} from '../../../src/domain/index.js';
import {
  MemoriaAuditoriaRepository,
  MemoriaGerenciadorTransacao,
} from '../../../src/modules/auditoria/auditoria.repository.js';
import { MemoriaContratoRepository } from '../../../src/modules/contrato/contrato.repository.js';
import { ContratoService } from '../../../src/modules/contrato/contrato.service.js';
import { MemoriaOrganizacaoRepository } from '../../../src/modules/organizacao/organizacao.repository.js';
import {
  type AtorOperacao,
  OrganizacaoService,
} from '../../../src/modules/organizacao/organizacao.service.js';

const ATOR_ADMIN: AtorOperacao = {
  id: '00000000-0000-0000-0000-000000000001',
  papel: Papel.ADMIN,
};

const ATOR_OPERADOR: AtorOperacao = {
  id: '00000000-0000-0000-0000-000000000002',
  papel: Papel.OPERADOR_CADASTRO,
};

const ATOR_GESTOR: AtorOperacao = {
  id: '00000000-0000-0000-0000-000000000003',
  papel: Papel.GESTOR_ALMOXARIFADO,
};

const ATOR_AUDITOR: AtorOperacao = {
  id: '00000000-0000-0000-0000-000000000004',
  papel: Papel.AUDITOR,
};

describe('OrganizacaoService e ContratoService (unitários em memória)', () => {
  let orgRepo: MemoriaOrganizacaoRepository;
  let contratoRepo: MemoriaContratoRepository;
  let auditoriaRepo: MemoriaAuditoriaRepository;
  let transacao: MemoriaGerenciadorTransacao;
  let orgService: OrganizacaoService;
  let contratoService: ContratoService;

  beforeEach(() => {
    orgRepo = new MemoriaOrganizacaoRepository();
    contratoRepo = new MemoriaContratoRepository();
    orgRepo.contratosRef = contratoRepo.itens;
    auditoriaRepo = new MemoriaAuditoriaRepository();
    transacao = new MemoriaGerenciadorTransacao();
    orgService = new OrganizacaoService(orgRepo, auditoriaRepo, transacao);
    contratoService = new ContratoService(contratoRepo, orgRepo, auditoriaRepo, transacao);
  });

  describe('OrganizacaoService', () => {
    it('cria organização normalizando CNPJ numérico com máscara e código para maiúsculas e grava auditoria', async () => {
      const org = await orgService.criar(ATOR_OPERADOR, {
        codigo: ' br001 ',
        cnpj: '11.222.333/0001-81',
        nome: ' Cooperativa Verde ',
      });

      expect(org.codigo).toBe('BR001');
      expect(org.cnpj).toBe('11222333000181');
      expect(org.nome).toBe('Cooperativa Verde');
      expect(org.versao).toBe(1);
      expect(auditoriaRepo.registros).toHaveLength(1);
      expect(auditoriaRepo.registros[0]?.acao).toBe('CRIAR');
      expect(auditoriaRepo.registros[0]?.entidade).toBe('Organizacao');
    });

    it('cria organização com CNPJ alfanumérico válido (12ABC34501DE35)', async () => {
      const org = await orgService.criar(ATOR_ADMIN, {
        codigo: 'ALFA01',
        cnpj: '12.ABC.345/01DE-35',
        nome: 'Recicladora Alfa',
      });

      expect(org.cnpj).toBe('12ABC34501DE35');
    });

    it('rejeita CNPJ inválido e CNPJ com dígitos repetidos (R1)', async () => {
      await expect(
        orgService.criar(ATOR_ADMIN, {
          codigo: 'ORG1',
          cnpj: '11.222.333/0001-82',
          nome: 'Org Inválida',
        }),
      ).rejects.toBeInstanceOf(ErroRegraDeNegocio);

      await expect(
        orgService.criar(ATOR_ADMIN, {
          codigo: 'ORG2',
          cnpj: '00000000000000',
          nome: 'Org Sequência',
        }),
      ).rejects.toBeInstanceOf(ErroRegraDeNegocio);
    });

    it('rejeita CNPJ duplicado (409) e código duplicado (409)', async () => {
      await orgService.criar(ATOR_ADMIN, {
        codigo: 'BR001',
        cnpj: '11222333000181',
        nome: 'Org 1',
      });

      await expect(
        orgService.criar(ATOR_ADMIN, {
          codigo: 'BR002',
          cnpj: '11.222.333/0001-81',
          nome: 'Org Mesmo CNPJ',
        }),
      ).rejects.toBeInstanceOf(ErroConflito);

      await expect(
        orgService.criar(ATOR_ADMIN, {
          codigo: 'br001',
          cnpj: '12ABC34501DE35',
          nome: 'Org Mesmo Código',
        }),
      ).rejects.toBeInstanceOf(ErroConflito);
    });

    it('atualiza organização incrementando versão e falha com 409 se versão divergir', async () => {
      const criada = await orgService.criar(ATOR_ADMIN, {
        codigo: 'BR001',
        cnpj: '11222333000181',
        nome: 'Nome Inicial',
      });

      const atualizada = await orgService.atualizar(ATOR_OPERADOR, {
        id: criada.id,
        versao: 1,
        nome: 'Nome Atualizado',
      });

      expect(atualizada.versao).toBe(2);
      expect(atualizada.nome).toBe('Nome Atualizado');

      await expect(
        orgService.atualizar(ATOR_OPERADOR, {
          id: criada.id,
          versao: 1, // versão obsoleta
          nome: 'Tentativa Concorrente',
        }),
      ).rejects.toBeInstanceOf(ErroConflitoDeVersao);
    });

    it('bloqueia criação e atualização por GESTOR_ALMOXARIFADO e AUDITOR (403), mas permite leitura', async () => {
      const criada = await orgService.criar(ATOR_ADMIN, {
        codigo: 'BR001',
        cnpj: '11222333000181',
        nome: 'Org Leitura',
      });

      await expect(
        orgService.criar(ATOR_GESTOR, {
          codigo: 'BR002',
          cnpj: '12ABC34501DE35',
          nome: 'Tentativa Gestor',
        }),
      ).rejects.toBeInstanceOf(ErroSemPermissao);

      await expect(
        orgService.criar(ATOR_AUDITOR, {
          codigo: 'BR003',
          cnpj: '12ABC34501DE35',
          nome: 'Tentativa Auditor',
        }),
      ).rejects.toBeInstanceOf(ErroSemPermissao);

      await expect(
        orgService.atualizar(ATOR_AUDITOR, {
          id: criada.id,
          versao: 1,
          nome: 'Alteração Indevida',
        }),
      ).rejects.toBeInstanceOf(ErroSemPermissao);

      const detalheGestor = await orgService.buscarPorId(ATOR_GESTOR, criada.id);
      expect(detalheGestor.id).toBe(criada.id);

      const listaAuditor = await orgService.listar(ATOR_AUDITOR, { pagina: 1, tamanhoPagina: 10 });
      expect(listaAuditor.dados).toHaveLength(1);
    });
  });

  describe('ContratoService', () => {
    it('cria contrato válido vinculado à organização e retorna no detalhe da organização', async () => {
      const org = await orgService.criar(ATOR_ADMIN, {
        codigo: 'BR001',
        cnpj: '11222333000181',
        nome: 'Org Com Contrato',
      });

      const contrato = await contratoService.criar(ATOR_OPERADOR, {
        organizacaoId: org.id,
        numero: 'ct-2026-001',
        clausulas: { slaHoras: 48 },
        inicio: '2026-01-01',
        fim: '2026-12-31',
      });

      expect(contrato.numero).toBe('CT-2026-001');
      expect(contrato.versao).toBe(1);

      const orgDetalhe = await orgService.buscarPorId(ATOR_AUDITOR, org.id);
      expect(orgDetalhe.contrato?.numero).toBe('CT-2026-001');
    });

    it('rejeita contrato com data de fim anterior à data de início (422)', async () => {
      const org = await orgService.criar(ATOR_ADMIN, {
        codigo: 'BR001',
        cnpj: '11222333000181',
        nome: 'Org Datas',
      });

      await expect(
        contratoService.criar(ATOR_ADMIN, {
          organizacaoId: org.id,
          numero: 'CT-INVALIDO',
          inicio: '2026-06-10',
          fim: '2026-06-09',
        }),
      ).rejects.toBeInstanceOf(ErroRegraDeNegocio);
    });

    it('rejeita segundo contrato para a mesma organização (409) ou número de contrato duplicado (409)', async () => {
      const org1 = await orgService.criar(ATOR_ADMIN, {
        codigo: 'BR001',
        cnpj: '11222333000181',
        nome: 'Org 1',
      });
      const org2 = await orgService.criar(ATOR_ADMIN, {
        codigo: 'BR002',
        cnpj: '12ABC34501DE35',
        nome: 'Org 2',
      });

      await contratoService.criar(ATOR_ADMIN, {
        organizacaoId: org1.id,
        numero: 'CT-UNICO',
        inicio: '2026-01-01',
      });

      await expect(
        contratoService.criar(ATOR_ADMIN, {
          organizacaoId: org1.id,
          numero: 'CT-OUTRO',
          inicio: '2026-01-01',
        }),
      ).rejects.toBeInstanceOf(ErroConflito);

      await expect(
        contratoService.criar(ATOR_ADMIN, {
          organizacaoId: org2.id,
          numero: 'CT-UNICO',
          inicio: '2026-01-01',
        }),
      ).rejects.toBeInstanceOf(ErroConflito);
    });

    it('atualiza contrato verificando versão, rejeita versão divergente (409) e valida organização inexistente (404)', async () => {
      const org = await orgService.criar(ATOR_ADMIN, {
        codigo: 'BR001',
        cnpj: '11222333000181',
        nome: 'Org Contrato',
      });

      await contratoService.criar(ATOR_ADMIN, {
        organizacaoId: org.id,
        numero: 'CT-01',
        inicio: '2026-01-01',
        fim: '2026-06-30',
      });

      const atualizado = await contratoService.atualizar(ATOR_OPERADOR, {
        organizacaoId: org.id,
        versao: 1,
        fim: '2026-12-31',
      });

      expect(atualizado.versao).toBe(2);

      await expect(
        contratoService.atualizar(ATOR_OPERADOR, {
          organizacaoId: org.id,
          versao: 1,
          numero: 'CT-02',
        }),
      ).rejects.toBeInstanceOf(ErroConflitoDeVersao);

      await expect(
        contratoService.buscarPorOrganizacao(
          ATOR_ADMIN,
          '00000000-0000-0000-0000-999999999999',
        ),
      ).rejects.toBeInstanceOf(ErroNaoEncontrado);
    });
  });
});
