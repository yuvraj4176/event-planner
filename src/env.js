/** @module env */
import { fileURLToPath } from 'node:url';

const DEFAULT_ENV_FILE = fileURLToPath(new URL('../.env', import.meta.url));

/**
 * Loads environment variables from a .env file into process.env without overriding existing keys.
 * @param {string} [file=DEFAULT_ENV_FILE]
 * @param {(filePath: string) => void} [load=process.loadEnvFile]
 * @returns {boolean} True if file was successfully loaded
 */
export function loadDotEnv(file = DEFAULT_ENV_FILE, load = process.loadEnvFile) {
  try {
    load(file);
    return true;
  } catch {
    return false;
  }
}
