/** @module logger */

/**
 * Creates a structured JSON logger for non-sensitive system events.
 * @param {{ write?: (line: string) => void, clock?: () => Date }} [options]
 * @returns {{ info: (event: string, fields?: object) => void, warn: (event: string, fields?: object) => void, error: (event: string, fields?: object) => void }}
 */
export function createLogger({ write = (line) => process.stderr.write(`${line}\n`), clock = () => new Date() } = {}) {
  function log(level, event, fields = {}) {
    write(JSON.stringify({ time: clock().toISOString(), level, event, ...fields }));
  }

  return {
    info: (event, fields) => log('info', event, fields),
    warn: (event, fields) => log('warn', event, fields),
    error: (event, fields) => log('error', event, fields),
  };
}

export const silentLogger = Object.freeze({
  info() {},
  warn() {},
  error() {},
});
