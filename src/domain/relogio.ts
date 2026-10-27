/**
 * Interface Relogio — injetada nos services e validadores para permitir testes
 * determinísticos de regras de data (R2) sem depender do relógio real.
 */
export interface Relogio {
  agora(): Date;
}

export class RelogioReal implements Relogio {
  agora(): Date {
    return new Date();
  }
}

export class RelogioFixo implements Relogio {
  constructor(private readonly data: Date) {}

  agora(): Date {
    return new Date(this.data);
  }
}
