/**
 * Interface Relogio — injetada nos services para permitir testes
 * determinísticos de regras de data (R2) sem depender do relógio real.
 */
export interface Relogio {
  agora(): Date;
}

/** Implementação real: usa Date.now() */
export class RelogioReal implements Relogio {
  agora(): Date {
    return new Date();
  }
}

/** Implementação de teste: retorna uma data fixa */
export class RelogioFixo implements Relogio {
  constructor(private readonly data: Date) {}

  agora(): Date {
    return new Date(this.data);
  }
}
