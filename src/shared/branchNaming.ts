export interface BranchNameSubject {
  id: string;
  title: string;
  externalKey?: string | null;
}

export const BRANCH_NAME_TEMPLATE_VARIABLES = [
  { token: '{date}', description: 'YYYYMM (e.g., 202601)' },
  { token: '{ticket}', description: 'External key (e.g., PROJ-123)' },
  { token: '{name}', description: 'Plan item title slug' },
  { token: '{id}', description: 'Plan item ID (6 chars)' },
] as const;

const PREVIEW_SUBJECT: BranchNameSubject = {
  id: 'abc123',
  title: 'Example Branch Name',
  externalKey: 'PROJ-123',
};

export function renderBranchName(
  subject: BranchNameSubject,
  template: string | undefined,
  now = new Date()
): string {
  const slug = subject.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);

  if (!template?.trim()) {
    return `${subject.externalKey || subject.id.substring(0, 6)}-${slug}`;
  }

  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return template
    .replace(/{date}/g, date)
    .replace(/{ticket}/g, subject.externalKey || '')
    .replace(/{name}/g, slug)
    .replace(/{id}/g, subject.id.substring(0, 6))
    .replace(/[_\-/]{2,}/g, (match) => match[0])
    .replace(/^[_\-/]+/, '')
    .replace(/[_\-/]+$/, '');
}

export function previewBranchName(template: string | undefined, now = new Date()): string {
  return renderBranchName(PREVIEW_SUBJECT, template, now);
}
