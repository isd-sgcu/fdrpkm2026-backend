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
  PORT: parsePort(process.env.PORT),
  HOST: process.env.HOST || DEFAULT_HOST,
  NODE_ENV: process.env.NODE_ENV || DEFAULT_NODE_ENV,
  LOG_LEVEL: process.env.LOG_LEVEL || DEFAULT_LOG_LEVEL,
  DATABASE_URL: process.env.DATABASE_URL || DEFAULT_DATABASE_URL,
  DATABASE_FILE: process.env.DATABASE_FILE || DEFAULT_DATABASE_FILE,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || "",
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || "",
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || ""
} as const;
