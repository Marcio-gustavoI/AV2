import { Type, type Static } from '@sinclair/typebox';
import { TipoEquipamentoSchema } from '../equipamento/equipamento.schemas.js';

export const FiltroRelatorioQuerySchema = Type.Object({
  organizacaoId: Type.Optional(Type.String({ format: 'uuid' })),
  dataInicio: Type.Optional(Type.String({ minLength: 10 })),
  dataFim: Type.Optional(Type.String({ minLength: 10 })),
});
export type FiltroRelatorioQuery = Static<typeof FiltroRelatorioQuerySchema>;

export const RelatorioResumoResponseSchema = Type.Object({
  totalEquipamentos: Type.Integer(),
  porStatus: Type.Record(Type.String(), Type.Integer()),
  porEstadoFisico: Type.Record(Type.String(), Type.Integer()),
  porOrganizacao: Type.Array(
    Type.Object({
      organizacaoId: Type.String({ format: 'uuid' }),
      codigo: Type.String(),
      nome: Type.String(),
      quantidade: Type.Integer(),
    }),
  ),
  periodo: Type.Object({
    dataInicio: Type.Union([Type.String(), Type.Null()]),
    dataFim: Type.Union([Type.String(), Type.Null()]),
  }),
});

export const RelatorioFinanceiroResponseSchema = Type.Object({
  totalEquipamentosAvaliados: Type.Integer(),
  equipamentosComValorAquisicao: Type.Integer(),
  equipamentosSemValorAquisicao: Type.Integer(),
  aliquotaImposto: Type.String(),
  somaValorAquisicao: Type.String(),
  somaValorResidual: Type.String(),
  somaImposto: Type.String(),
  itens: Type.Array(
    Type.Object({
      equipamentoId: Type.String({ format: 'uuid' }),
      codigoBarrasInterno: Type.String(),
      tipo: TipoEquipamentoSchema,
      valorAquisicao: Type.String(),
      coeficienteDepreciacao: Type.String(),
      valorResidual: Type.String(),
      imposto: Type.String(),
    }),
  ),
});
