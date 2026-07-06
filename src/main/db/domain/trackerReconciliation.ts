/**
 * Shared three-way reconciliation core for KPM <-> tracker sync. Both
 * directions (SyncService's inbound preview and ExportService's outbound
 * review) need the same answer to "did this field change, and on which
 * side?" — this module is the one place that answer is computed.
 *
 * Direction-specific policy (what to DO about a conflict, which fields to
 * check, how to surface it to the user) stays in the calling service.
 */

export type FieldChangeStatus = 'unchanged' | 'localChanged' | 'remoteChanged' | 'conflict';

export interface FieldChangeClassification<T> {
  status: FieldChangeStatus;
  local: T;
  remote: T;
}

export interface ClassifyFieldChangeInput<T> {
  local: T;
  remote: T;
  /** Value recorded at the last sync, or null when there is no prior snapshot (first sync). */
  snapshot: T | null;
  /** Canonicalizes cosmetic differences (e.g. markdown bullet style) before comparing. Defaults to identity. */
  normalize?: (value: T) => T;
}

/**
 * Three-way diff of a single field against local, remote, and the last
 * recorded snapshot. With no snapshot (first sync after import), there is
 * nothing to detect a local edit against, so a local/remote mismatch reads
 * as the remote value winning rather than a conflict.
 */
export function classifyFieldChange<T>(input: ClassifyFieldChangeInput<T>): FieldChangeClassification<T> {
  const { local, remote, snapshot } = input;
  const normalize = input.normalize ?? ((value: T) => value);

  const normalizedLocal = normalize(local);
  const normalizedRemote = normalize(remote);

  if (snapshot === null) {
    const status: FieldChangeStatus = normalizedLocal === normalizedRemote ? 'unchanged' : 'remoteChanged';
    return { status, local, remote };
  }

  const normalizedSnapshot = normalize(snapshot);
  const localChanged = normalizedLocal !== normalizedSnapshot;
  const remoteChanged = normalizedRemote !== normalizedSnapshot;

  let status: FieldChangeStatus;
  if (localChanged && remoteChanged) {
    status = normalizedLocal === normalizedRemote ? 'unchanged' : 'conflict';
  } else if (remoteChanged) {
    status = 'remoteChanged';
  } else if (localChanged) {
    status = 'localChanged';
  } else {
    status = 'unchanged';
  }

  return { status, local, remote };
}

export interface HasRemoteFieldDriftedInput<T> {
  remote: T;
  /** Value recorded at the last sync, or null when there is no prior snapshot (first sync). */
  snapshot: T | null;
  /** Canonicalizes cosmetic differences (e.g. markdown bullet style) before comparing. Defaults to identity. */
  normalize?: (value: T) => T;
}

/**
 * Two-way drift check for the outbound direction: the item is already queued
 * for export, so "local changed" is a given — the only open question is
 * whether the remote value has actually moved off what we last recorded,
 * as opposed to the tracker merely bumping its `updated` timestamp on a
 * cosmetic re-render.
 */
export function hasRemoteFieldDrifted<T>(input: HasRemoteFieldDriftedInput<T>): boolean {
  const { remote, snapshot } = input;
  if (snapshot === null) return false;

  const normalize = input.normalize ?? ((value: T) => value);
  return normalize(remote) !== normalize(snapshot);
}
