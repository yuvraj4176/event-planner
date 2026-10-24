// Structured JSON logging. Callers pass only event names and non-sensitive
// fields; request bodies, user text and secrets are never logged.
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
