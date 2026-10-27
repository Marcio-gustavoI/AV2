import type { DetalheErro } from '../erros.js';
import { Validador } from './validador.js';

const PESOS_DV1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;
const PESOS_DV2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;

export function normalizarCnpj(cnpj: string): string {
  return cnpj.replace(/[.\-/\\\s]/g, '').toUpperCase();
}

function calcularDigitoVerificador(base: string, pesos: readonly number[]): number {
  let soma = 0;
  for (let i = 0; i < pesos.length; i++) {
    const charCode = base.charCodeAt(i);
    const peso = pesos[i] ?? 0;
    const valor = charCode - 48;
    soma += valor * peso;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/**
 * ValidadorCnpj (R1 / A1-12):
 * - Normaliza removendo pontuação e espaços, convertendo para maiúsculas.
 * - Exige 14 caracteres no formato `^[A-Z0-9]{12}[0-9]{2}$` (compatível com IN RFB 2.229/2024).
 * - Rejeita sequências repetidas (ex.: "00000000000000", "11111111111111").
 * - Calcula os dois dígitos verificadores via Módulo 11 com ASCII - 48.
 */
export class ValidadorCnpj extends Validador<string> {
  protected coletarErros(entrada: string, erros: DetalheErro[]): void {
    const limpo = normalizarCnpj(entrada);

    if (limpo.length !== 14) {
      erros.push({
        campo: 'cnpj',
        mensagem: 'CNPJ deve conter exatamente 14 caracteres após normalização.',
      });
      return;
    }

    const primeiroChar = limpo[0];
    if (primeiroChar !== undefined && limpo.split('').every((c) => c === primeiroChar)) {
      erros.push({
        campo: 'cnpj',
        mensagem: 'CNPJ inválido: sequência de caracteres repetidos não é permitida.',
      });
      return;
    }

    if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(limpo)) {
      erros.push({
        campo: 'cnpj',
        mensagem:
          'CNPJ com formato inválido: as 12 primeiras posições aceitam letras (A-Z) e números (0-9) e os 2 dígitos verificadores devem ser numéricos.',
      });
      return;
    }

    const base12 = limpo.slice(0, 12);
    const dvInformado = limpo.slice(12, 14);

    const dv1 = calcularDigitoVerificador(base12, PESOS_DV1);
    const dv2 = calcularDigitoVerificador(`${base12}${dv1}`, PESOS_DV2);
    const dvCalculado = `${dv1}${dv2}`;

    if (dvInformado !== dvCalculado) {
      erros.push({
        campo: 'cnpj',
        mensagem: 'CNPJ inválido: dígitos verificadores não conferem.',
      });
    }
  }
}
