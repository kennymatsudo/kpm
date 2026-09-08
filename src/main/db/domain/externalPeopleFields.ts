import type { ExternalIssue } from '../../tracker-clients/common/types';

/**
 * The six plan-item columns that mirror a tracker issue's assignee and
 * creator. Every path that records an `ExternalIssue` locally — inbound
 * import, inbound sync, and the outbound export's local acknowledgement —
 * must write all of them. Miss one direction and the next inbound sync
 * reports the untouched columns as remote changes.
 */
export interface ExternalPeopleFields {
  external_assignee_id: string | null;
  external_assignee_name: string | null;
  external_assignee_avatar_url: string | null;
  external_creator_id: string | null;
  external_creator_name: string | null;
  external_creator_avatar_url: string | null;
}

export function externalPeopleFields(
  issue: Pick<ExternalIssue, 'assignee' | 'creator'>
): ExternalPeopleFields {
  return {
    external_assignee_id: issue.assignee?.id ?? null,
    external_assignee_name: issue.assignee?.name ?? null,
    external_assignee_avatar_url: issue.assignee?.avatarUrl ?? null,
    external_creator_id: issue.creator?.id ?? null,
    external_creator_name: issue.creator?.name ?? null,
    external_creator_avatar_url: issue.creator?.avatarUrl ?? null,
  };
}
