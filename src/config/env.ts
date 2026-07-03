const DEFAULT_PORT = 3000;
const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_NODE_ENV = "development";
const DEFAULT_LOG_LEVEL = "info";
const DEFAULT_DATABASE_FILE = "./local.db";
const DEFAULT_DATABASE_URL = "";

const parsePort = (value: string | undefined): number => {
  if (!value) {
    return DEFAULT_PORT;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  return port;
};

export const env = {
  PORT: parsePort(Bun.env.PORT),
  HOST: Bun.env.HOST || DEFAULT_HOST,
  NODE_ENV: Bun.env.NODE_ENV || DEFAULT_NODE_ENV,
  LOG_LEVEL: Bun.env.LOG_LEVEL || DEFAULT_LOG_LEVEL,
  DATABASE_URL: Bun.env.DATABASE_URL || DEFAULT_DATABASE_URL,
  DATABASE_FILE: Bun.env.DATABASE_FILE || DEFAULT_DATABASE_FILE,
  BETTER_AUTH_SECRET: Bun.env.BETTER_AUTH_SECRET || "",
  BETTER_AUTH_URL: Bun.env.BETTER_AUTH_URL || ""
} as const;
