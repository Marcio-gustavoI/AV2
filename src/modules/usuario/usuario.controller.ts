import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Papel } from '../../domain/index.js';
import { exigirPapel, obterUsuarioRequisicao } from '../../plugins/auth.js';
import type { EntidadeUsuario } from './usuario.repository.js';
import type { UsuarioService } from './usuario.service.js';
import {
  AtualizarUsuarioBodySchema,
  CriarUsuarioBodySchema,
  ListaPaginadaUsuariosResponseSchema,
  ListarUsuariosQuerySchema,
  UsuarioParamsSchema,
  UsuarioResponseSchema,
} from './usuario.schemas.js';

function serializarUsuario(u: EntidadeUsuario) {
  return {
    id: u.id,
    email: u.email,
    papel: u.papel,
    ativo: u.ativo,
    versao: u.versao,
    criadoEm: u.criadoEm.toISOString(),
  };
}

export function registrarRotasUsuario(
  app: FastifyInstance,
  usuarioService: UsuarioService,
): void {
  const servidor = app.withTypeProvider<TypeBoxTypeProvider>();
  const somenteAdmin = [Papel.ADMIN] as const;

  servidor.post(
    '/usuarios',
    {
      preHandler: [exigirPapel(somenteAdmin)],
      schema: {
        tags: ['Usuários'],
        summary: 'Cria uma nova conta de usuário (exclusivo ADMIN)',
        body: CriarUsuarioBodySchema,
        response: {
          201: UsuarioResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const ator = obterUsuarioRequisicao(request);
      const criado = await usuarioService.criar(ator, request.body);
      return reply.status(201).send(serializarUsuario(criado));
    },
  );

  servidor.get(
    '/usuarios',
    {
      preHandler: [exigirPapel(somenteAdmin)],
      schema: {
        tags: ['Usuários'],
        summary: 'Lista usuários cadastrados (exclusivo ADMIN, sem senhaHash)',
        querystring: ListarUsuariosQuerySchema,
        response: {
          200: ListaPaginadaUsuariosResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const ator = obterUsuarioRequisicao(request);
      const resultado = await usuarioService.listar(ator, {
        pagina: request.query.pagina,
        tamanhoPagina: request.query.tamanhoPagina,
      });
      return reply.status(200).send({
        dados: resultado.dados.map(serializarUsuario),
        paginacao: resultado.paginacao,
      });
    },
  );

  servidor.get(
    '/usuarios/:id',
    {
      preHandler: [exigirPapel(somenteAdmin)],
      schema: {
        tags: ['Usuários'],
        summary: 'Consulta um usuário por ID (exclusivo ADMIN, sem senhaHash)',
        params: UsuarioParamsSchema,
        response: {
          200: UsuarioResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const ator = obterUsuarioRequisicao(request);
      const usuario = await usuarioService.buscarPorId(ator, request.params.id);
      return reply.status(200).send(serializarUsuario(usuario));
    },
  );

  servidor.patch(
    '/usuarios/:id',
    {
      preHandler: [exigirPapel(somenteAdmin)],
      schema: {
        tags: ['Usuários'],
        summary: 'Atualiza dados, papel ou status ativo de um usuário com controle de versão',
        params: UsuarioParamsSchema,
        body: AtualizarUsuarioBodySchema,
        response: {
          200: UsuarioResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const ator = obterUsuarioRequisicao(request);
      const atualizado = await usuarioService.atualizar(ator, {
        id: request.params.id,
        versao: request.body.versao,
        email: request.body.email,
        senha: request.body.senha,
        papel: request.body.papel,
        ativo: request.body.ativo,
      });
      return reply.status(200).send(serializarUsuario(atualizado));
    },
  );
}
