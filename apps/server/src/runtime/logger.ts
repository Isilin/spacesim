/** Sous-ensemble de l'API pino utilisé par le moteur — un message par appel, pas d'objet fusionné. */
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
}

/** Logger par défaut : console brute, comme avant l'injection (utilisé hors boot, ex. tests). */
export const consoleLogger: Logger = {
  info: (message) => console.log(message),
  warn: (message) => console.warn(message),
};
