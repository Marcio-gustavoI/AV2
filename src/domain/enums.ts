/**
 * Enums de domínio do greencode (independentes do Prisma/framework).
 */

export const Papel = {
  ADMIN: 'ADMIN',
  OPERADOR_CADASTRO: 'OPERADOR_CADASTRO',
  GESTOR_ALMOXARIFADO: 'GESTOR_ALMOXARIFADO',
  AUDITOR: 'AUDITOR',
} as const;
export type Papel = (typeof Papel)[keyof typeof Papel];

export const EstadoFisico = {
  SUCATA: 'SUCATA',
  RUIM: 'RUIM',
  REGULAR: 'REGULAR',
  BOM: 'BOM',
  EXCELENTE: 'EXCELENTE',
} as const;
export type EstadoFisico = (typeof EstadoFisico)[keyof typeof EstadoFisico];

export const VALOR_ESTADO_FISICO: Record<EstadoFisico, number> = {
  SUCATA: 0,
  RUIM: 1,
  REGULAR: 2,
  BOM: 3,
  EXCELENTE: 4,
};

export function valorEstadoFisico(estado: EstadoFisico): number {
  return VALOR_ESTADO_FISICO[estado];
}

export const StatusEquipamento = {
  RECEBIDO: 'RECEBIDO',
  EM_TRIAGEM: 'EM_TRIAGEM',
  TRIADO: 'TRIADO',
  EM_DESMONTE: 'EM_DESMONTE',
  DESMONTADO: 'DESMONTADO',
  DESTINADO: 'DESTINADO',
} as const;
export type StatusEquipamento = (typeof StatusEquipamento)[keyof typeof StatusEquipamento];

export const ORDEM_STATUS_EQUIPAMENTO: readonly StatusEquipamento[] = [
  StatusEquipamento.RECEBIDO,
  StatusEquipamento.EM_TRIAGEM,
  StatusEquipamento.TRIADO,
  StatusEquipamento.EM_DESMONTE,
  StatusEquipamento.DESMONTADO,
  StatusEquipamento.DESTINADO,
];

export const TipoEquipamento = {
  DESKTOP: 'DESKTOP',
  NOTEBOOK: 'NOTEBOOK',
  MONITOR: 'MONITOR',
  SERVIDOR: 'SERVIDOR',
  PERIFERICO: 'PERIFERICO',
  REDE: 'REDE',
  OUTRO: 'OUTRO',
} as const;
export type TipoEquipamento = (typeof TipoEquipamento)[keyof typeof TipoEquipamento];

export const ClassificacaoDestino = {
  REUTILIZACAO: 'REUTILIZACAO',
  RECICLAGEM: 'RECICLAGEM',
  DESCARTE_SEGURO: 'DESCARTE_SEGURO',
} as const;
export type ClassificacaoDestino = (typeof ClassificacaoDestino)[keyof typeof ClassificacaoDestino];

export type Severidade = 'AVISO' | 'ERRO' | 'CRITICO';
