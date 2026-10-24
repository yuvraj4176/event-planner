import { fileURLToPath } from 'node:url';

const DEFAULT_ENV_FILE = fileURLToPath(new URL('../.env', import.meta.url));

// Loads settings from the project's .env file into process.env, so the API key
// can live in a file that is kept out of version control. Variables that are
// already set in the environment win. A missing file is not an error.
export function loadDotEnv(file = DEFAULT_ENV_FILE, load = process.loadEnvFile) {
  try {
    load(file);
    return true;
  } catch {
    return false;
  }
}
