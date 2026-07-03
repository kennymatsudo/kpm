/**
 * Terminal Validation Schemas — embedded developer terminal panel.
 */

import { terminalEndpoints } from '../../../shared/ipc/terminalEndpoints';

export const TerminalSchemas = {
  create: terminalEndpoints.create.params,
  write: terminalEndpoints.write.params,
  resize: terminalEndpoints.resize.params,
  kill: terminalEndpoints.kill.params,
};
