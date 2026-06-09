/**
 * Shared execFile mock for services that shell out to git.
 *
 * Usage:
 *   vi.mock('child_process', () => ({ execFile: vi.fn() }));
 *   import { execFile } from 'child_process';
 *
 *   const mockExecFile = vi.mocked(execFile);
 *   mockExecFile.mockImplementation(createExecFileMock({
 *     onCall: (args) => {
 *       if (args[0] === 'add') return { stdout: '', stderr: '' };
 *       return new Error(`Unexpected git call: ${args.join(' ')}`);
 *     },
 *   }) as never);
 */
import type { execFile } from 'child_process';

export interface ExecFileMockHandlers {
  /** Return stdout/stderr for a call, or an Error to fail it. */
  onCall: (args: string[], command: string) => { stdout: string; stderr: string } | Error;
}

export function createExecFileMock(handlers: ExecFileMockHandlers) {
  return (
    cmd: string,
    args: readonly string[] | null | undefined,
    _opts: unknown,
    callback?: (error: Error | null, result: { stdout: string; stderr: string }) => void
  ) => {
    const normalizedArgs = (Array.isArray(args) ? args.slice() : []) as string[];
    const response = handlers.onCall(normalizedArgs, cmd);
    if (callback) {
      if (response instanceof Error) {
        callback(response, { stdout: '', stderr: '' });
      } else {
        callback(null, response);
      }
    }
    return {} as ReturnType<typeof execFile>;
  };
}
