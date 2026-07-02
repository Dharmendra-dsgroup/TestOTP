import winston from "winston";

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: "HH:mm:ss" }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, ...meta }) => {
    const extras = Object.keys(meta).length
      ? ` ${JSON.stringify(meta)}`
      : "";
    return `${ts} [${level}] ${message}${extras}`;
  })
);

const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

function getLogLevel(): string {
  return process.env.LOG_LEVEL ?? "info";
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function isTest(): boolean {
  return process.env.NODE_ENV === "test";
}

export const logger = winston.createLogger({
  level: getLogLevel(),
  format: isProduction() ? prodFormat : devFormat,
  defaultMeta: {
    service: "otp-login-pro",
    version: process.env.APP_VERSION ?? "1.0.0",
    env: process.env.NODE_ENV ?? "development",
  },
  transports: [
    new winston.transports.Console({
      silent: isTest(),
    }),
  ],
  exceptionHandlers: [
    new winston.transports.Console({
      silent: isTest(),
    }),
  ],
  rejectionHandlers: [
    new winston.transports.Console({
      silent: isTest(),
    }),
  ],
});

export default logger;
