    ?? candidates.find((candidate) => slugify(stringValue(candidate.contribution.id) ?? '') === parts.themeSlug)
    warnings.push(`Skipped ${stringValue(contribution.label) ?? 'theme'} because only JSON themes are supported.`);
    warnings.push(`Skipped ${stringValue(contribution.label) ?? contribution.path} because its theme file could not be read.`);
  const label = stringValue(contribution.label) ?? stringValue(json.name) ?? path.basename(themePath, '.json');
function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

