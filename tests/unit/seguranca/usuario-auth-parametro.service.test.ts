import { beforeEach, describe, expect, it } from 'vitest';
import {
  ErroConflito,
  ErroNaoAutenticado,
  ErroRegraDeNegocio,
  ErroSemPermissao,
  Papel,
} from '../../../src/domain/index.js';
import {
  MemoriaAuditoriaRepository,
  MemoriaGerenciadorTransacao,
} from '../../../src/modules/auditoria/auditoria.repository.js';
import { AuthService } from '../../../src/modules/auth/auth.service.js';
import type { AtorOperacao } from '../../../src/modules/organizacao/organizacao.service.js';
import { MemoriaParametroRepository } from '../../../src/modules/parametro/parametro.repository.js';
import { ParametroService } from '../../../src/modules/parametro/parametro.service.js';
import { MemoriaUsuarioRepository } from '../../../src/modules/usuario/usuario.repository.js';
import { UsuarioService } from '../../../src/modules/usuario/usuario.service.js';

const ATOR_ADMIN: AtorOperacao = {
  id: '00000000-0000-0000-0000-000000000001',
  papel: Papel.ADMIN,
};

const ATOR_OPERADOR: AtorOperacao = {
  id: '00000000-0000-0000-0000-000000000002',
  papel: Papel.OPERADOR_CADASTRO,
};

describe('Segurança: UsuarioService, AuthService e ParametroService (unitários em memória)', () => {
  let usuarioRepo: MemoriaUsuarioRepository;
  let parametroRepo: MemoriaParametroRepository;
  let auditoriaRepo: MemoriaAuditoriaRepository;
  let transacao: MemoriaGerenciadorTransacao;
  let usuarioService: UsuarioService;
  let authService: AuthService;
  let parametroService: ParametroService;

  beforeEach(() => {
    usuarioRepo = new MemoriaUsuarioRepository();
    parametroRepo = new MemoriaParametroRepository();
    auditoriaRepo = new MemoriaAuditoriaRepository();
    transacao = new MemoriaGerenciadorTransacao();
    usuarioService = new UsuarioService(usuarioRepo, auditoriaRepo, transacao, 4);
    authService = new AuthService(
      usuarioRepo,
      {
        assinar: (payload) => `jwt-ficticio-${payload.sub}-${payload.papel}`,
      },
      '30m',
    );
    parametroService = new ParametroService(parametroRepo, auditoriaRepo, transacao);
  });

  it('cria usuário com senha válida (>=10 chars, letras e números), nunca retorna senhaHash e grava auditoria sem hash', async () => {
    const criado = await usuarioService.criar(ATOR_ADMIN, {
      email: '  Operador@GreenCode.com.br ',
      senha: 'SenhaForte123',
      papel: Papel.OPERADOR_CADASTRO,
    });

    expect(criado.email).toBe('operador@greencode.com.br');
    expect('senhaHash' in criado).toBe(false);
    expect(auditoriaRepo.registros).toHaveLength(1);
    expect(JSON.stringify(auditoriaRepo.registros[0])).not.toContain('SenhaForte123');
    expect(JSON.stringify(auditoriaRepo.registros[0])).not.toContain('$2');
  });

  it('rejeita senha com menos de 10 caracteres, sem letras ou sem números (R12) e e-mail duplicado (409)', async () => {
    await expect(
      usuarioService.criar(ATOR_ADMIN, {
        email: 'u1@greencode.com',
        senha: 'Curta123',
        papel: Papel.AUDITOR,
      }),
    ).rejects.toBeInstanceOf(ErroRegraDeNegocio);

    await expect(
      usuarioService.criar(ATOR_ADMIN, {
        email: 'u1@greencode.com',
        senha: 'SomenteLetrasLonga',
        papel: Papel.AUDITOR,
      }),
    ).rejects.toBeInstanceOf(ErroRegraDeNegocio);

    await expect(
      usuarioService.criar(ATOR_ADMIN, {
        email: 'u1@greencode.com',
        senha: '123456789012',
        papel: Papel.AUDITOR,
      }),
    ).rejects.toBeInstanceOf(ErroRegraDeNegocio);

    await usuarioService.criar(ATOR_ADMIN, {
      email: 'unico@greencode.com',
      senha: 'SenhaValida10',
      papel: Papel.AUDITOR,
    });

    await expect(
      usuarioService.criar(ATOR_ADMIN, {
        email: 'UNICO@greencode.com',
        senha: 'OutraSenha10',
        papel: Papel.AUDITOR,
      }),
    ).rejects.toBeInstanceOf(ErroConflito);
  });

  it('impede que ADMIN desative a si mesmo ou desative o último ADMIN ativo (R12)', async () => {
    const adminUnico = await usuarioService.criar(ATOR_ADMIN, {
      email: 'admin@greencode.com',
      senha: 'AdminSenha123',
      papel: Papel.ADMIN,
    });

    // Tentativa de auto-desativação
    await expect(
      usuarioService.atualizar(
        { id: adminUnico.id, papel: Papel.ADMIN },
        {
          id: adminUnico.id,
          versao: 1,
          ativo: false,
        },
      ),
    ).rejects.toBeInstanceOf(ErroRegraDeNegocio);

    // Tentativa de outro ator ADMIN (fictício, não persistido no banco) desativar o único ADMIN ativo persistido
    await expect(
      usuarioService.atualizar(ATOR_ADMIN, {
        id: adminUnico.id,
        versao: 1,
        ativo: false,
      }),
    ).rejects.toBeInstanceOf(ErroRegraDeNegocio);
  });

  it('AuthService retorna erro idêntico para senha errada e e-mail inexistente, e bloqueia usuário inativo', async () => {
    const u = await usuarioService.criar(ATOR_ADMIN, {
      email: 'gestor@greencode.com',
      senha: 'GestorSenha123',
      papel: Papel.GESTOR_ALMOXARIFADO,
    });

    let erroEmailInexistente: ErroNaoAutenticado | undefined;
    let erroSenhaErrada: ErroNaoAutenticado | undefined;

    try {
      await authService.login('naoexiste@greencode.com', 'GestorSenha123');
    } catch (e) {
      erroEmailInexistente = e as ErroNaoAutenticado;
    }

    try {
      await authService.login('gestor@greencode.com', 'SenhaIncorreta999');
    } catch (e) {
      erroSenhaErrada = e as ErroNaoAutenticado;
    }

    expect(erroEmailInexistente).toBeInstanceOf(ErroNaoAutenticado);
    expect(erroSenhaErrada).toBeInstanceOf(ErroNaoAutenticado);
    expect(erroEmailInexistente?.message).toBe(erroSenhaErrada?.message);
    expect(erroEmailInexistente?.codigo).toBe(erroSenhaErrada?.codigo);

    const loginOk = await authService.login('gestor@greencode.com', 'GestorSenha123');
    expect(loginOk.token).toContain(u.id);

    // Desativa o usuário e tenta autenticar novamente
    await usuarioService.atualizar(ATOR_ADMIN, {
      id: u.id,
      versao: 1,
      ativo: false,
    });

    await expect(
      authService.login('gestor@greencode.com', 'GestorSenha123'),
    ).rejects.toBeInstanceOf(ErroNaoAutenticado);
  });

  it('ParametroService rejeita valor negativo, exige ADMIN e aplica controle de versão', async () => {
    await expect(
      parametroService.definir(ATOR_OPERADOR, {
        chave: 'ALIQUOTA_IMPOSTO',
        valor: '0.15',
      }),
    ).rejects.toBeInstanceOf(ErroSemPermissao);

    await expect(
      parametroService.definir(ATOR_ADMIN, {
        chave: 'ALIQUOTA_IMPOSTO',
        valor: '-0.05',
      }),
    ).rejects.toBeInstanceOf(ErroRegraDeNegocio);

    const criado = await parametroService.definir(ATOR_ADMIN, {
      chave: 'aliquota_imposto',
      valor: '0.15',
    });
    expect(criado.chave).toBe('ALIQUOTA_IMPOSTO');
    expect(criado.valor).toBe('0.150000');
    expect(criado.versao).toBe(1);

    const atualizado = await parametroService.definir(ATOR_ADMIN, {
      chave: 'ALIQUOTA_IMPOSTO',
      valor: '0.18',
      versao: 1,
    });
    expect(atualizado.versao).toBe(2);
    expect(atualizado.valor).toBe('0.180000');
  });
});
