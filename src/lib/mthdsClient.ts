import { MthdsApiClient } from "mthds";

let cached: MthdsApiClient | null = null;

/**
 * Returns a process-wide MthdsApiClient.
 *
 * The `mthds` SDK natively reads MTHDS_BASE_URL / MTHDS_API_KEY from the
 * environment, so the no-arg constructor is all this starter needs — no env
 * bridging. `.env.example`, the README, and every error message reference the
 * same two MTHDS_* vars.
 *
 * One client per process also keeps the SDK's handshake with the API (whether
 * it holds a blob store, which limits it sets on a method's tree): the SDK asks
 * for it once and reuses it for `HANDSHAKE_TTL_MS` rather than before every run.
 *
 * Note: when MTHDS_BASE_URL is unset the SDK falls back to its own hosted
 * default, so `.env.example` sets it explicitly (a local MTHDS API at
 * http://127.0.0.1:8081 by default). A value with a path, such as `.../v1`,
 * makes the constructor throw, which the actions report as `config_invalid`.
 */
export function getMthdsClient(): MthdsApiClient {
  if (!cached) {
    cached = new MthdsApiClient();
  }
  return cached;
}
