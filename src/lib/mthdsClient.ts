import { MthdsApiClient } from "mthds";

let cached: MthdsApiClient | null = null;

/**
 * Returns a process-wide MthdsApiClient.
 *
 * The `mthds` SDK natively reads MTHDS_API_URL / MTHDS_API_KEY from the
 * environment, so the no-arg constructor is all this starter needs — no env
 * bridging. `.env.example`, the README, and every error message reference the
 * same two MTHDS_* vars.
 *
 * Note: when MTHDS_API_URL is unset the SDK falls back to its own hosted
 * default, so the shipped `.env` / `.env.example` set it explicitly (a local
 * MTHDS API at http://127.0.0.1:8081 by default).
 */
export function getMthdsClient(): MthdsApiClient {
  if (!cached) {
    cached = new MthdsApiClient();
  }
  return cached;
}
