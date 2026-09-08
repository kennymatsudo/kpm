/**
 * Single owner of where a project's folder lives on disk.
 *
 * Two callers need this answer and must never disagree: `ProjectRepository`
 * creates the folder, and `ProjectService.getDefaultLocation` tells the
 * renderer what path a project will land in when the user doesn't pick one.
 *
 * `join` is injectable only because `ProjectRepository` takes its path
 * utilities as a constructor dependency; every real caller uses `path.join`.
 */

import path from 'path';

type Join = (...parts: string[]) => string;

/** Parent directory holding every KPM-managed project folder. */
export function projectsRootPath(userDataPath: string, join: Join = path.join): string {
  return join(userDataPath, 'projects');
}

/**
 * Folder path for a project the user didn't pick a location for. The id
 * suffix keeps same-named projects from colliding, which is why the full
 * path is only knowable once the project id exists.
 */
export function deriveProjectFolderPath(
  userDataPath: string,
  name: string,
  id: string,
  join: Join = path.join
): string {
  const shortId = id.split('-')[0];
  const safeName = name.replace(/[^a-zA-Z0-9-_]/g, '-');
  return join(projectsRootPath(userDataPath, join), `${safeName}-${shortId}`);
}
