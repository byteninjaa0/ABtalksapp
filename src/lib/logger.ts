type LogMeta = Record<string, unknown> | undefined;

function serializeMeta(meta: LogMeta): string {
  if (meta === undefined) return "";
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return " [meta_unserializable]";
  }
}

export const logger = {
  info(message: string, meta?: LogMeta) {
    console.info(`[abtalks] ${message}${serializeMeta(meta)}`);
  },
  warn(message: string, meta?: LogMeta) {
    console.warn(`[abtalks] ${message}${serializeMeta(meta)}`);
  },
  error(message: string, meta?: LogMeta) {
    console.error(`[abtalks] ${message}${serializeMeta(meta)}`);
  },
};
