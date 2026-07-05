/**
 * Testing domain endpoint registry.
 *
 * One entry per `testing:*` IPC endpoint, keyed by the dotted method path
 * used on `window.api.testing`. These handlers only exist when
 * `NODE_ENV=test` (see `handlers/testing.ts`) and back the e2e harness's
 * database reset / isolation checks — channel names and response shapes
 * must stay byte-identical since a running Playwright suite can't be
 * exercised from this migration.
 */

import { resultOf, type EndpointDefinition } from './endpoints';

/** `handlers/testing.ts`'s `resetDatabase` response: bare success/failure with an optional table count. */
type ResetDatabaseResponse = { success: true; tablesReset: number } | { success: false; error: string };

export const testingEndpoints = {
  resetDatabase: {
    channel: 'testing:reset-database',
    params: null,
    result: resultOf<ResetDatabaseResponse>(),
  },
  getDbPath: {
    channel: 'testing:get-db-path',
    params: null,
    result: resultOf<{ dbPath: string | null }>(),
  },
} satisfies Record<string, EndpointDefinition>;

export type TestingEndpoints = typeof testingEndpoints;
export type TestingEndpointName = keyof TestingEndpoints;
