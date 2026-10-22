export interface Palette {
  enabled: boolean;
  bold: (value: string) => string;
  dim: (value: string) => string;
  green: (value: string) => string;
  yellow: (value: string) => string;
  red: (value: string) => string;
  cyan: (value: string) => string;
  blue: (value: string) => string;
  magenta: (value: string) => string;
}

const wrap = (code: number, value: string) => `\u001b[${code}m${value}\u001b[0m`;

export function createPalette(enabled: boolean): Palette {
  if (!enabled) {
    const identity = (value: string) => value;
    return {
      enabled: false,
      bold: identity,
      dim: identity,
      green: identity,
      yellow: identity,
      red: identity,
      cyan: identity,
      blue: identity,
      magenta: identity,
    };
  }

  return {
    enabled: true,
    bold: (value) => wrap(1, value),
    dim: (value) => wrap(2, value),
    green: (value) => wrap(32, value),
    yellow: (value) => wrap(33, value),
    red: (value) => wrap(31, value),
    cyan: (value) => wrap(36, value),
    blue: (value) => wrap(34, value),
    magenta: (value) => wrap(35, value),
  };
}

export function shouldUseColor(
  option: boolean | undefined,
  stream: { isTTY?: boolean },
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (option === false) return false;
  if (option === true) return true;
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return false;
  if (env.FORCE_COLOR === "0") return false;
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== "") return true;
  return Boolean(stream.isTTY);
}
