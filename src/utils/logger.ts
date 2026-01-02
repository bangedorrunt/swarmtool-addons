import pino from 'pino';

const isTest = process.env.NODE_ENV === 'test';

export const logger = pino({
  level: isTest ? 'silent' : process.env.LOG_LEVEL || 'info',
  transport: isTest
    ? undefined
    : {
        target: 'pino/file',
        options: { destination: 1 },
      },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  base: {
    service: 'opencode-addons',
  },
});

export const createModuleLogger = (module: string) => {
  return logger.child({ module });
};

export const logInfo = (message: string, data?: Record<string, unknown>) => {
  if (data) {
    logger.info(data, message);
  } else {
    logger.info(message);
  }
};

export const logWarn = (message: string, data?: Record<string, unknown>) => {
  if (data) {
    logger.warn(data, message);
  } else {
    logger.warn(message);
  }
};

export const logError = (message: string, error?: Error | unknown) => {
  if (error instanceof Error) {
    logger.error({ err: error, message }, message);
  } else if (error) {
    logger.error({ error }, message);
  } else {
    logger.error(message);
  }
};

export const logDebug = (message: string, data?: Record<string, unknown>) => {
  if (data) {
    logger.debug(data, message);
  } else {
    logger.debug(message);
  }
};
