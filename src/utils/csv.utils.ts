export function sanitizeCsvCell(value: unknown): string {
  // Convert null/undefined to empty string
  const stringValue = value == null ? '' : String(value);
  // If the string starts with any formula injection prefix, prepend a single quote.
  if (/^[=+\-@]/.test(stringValue)) {
    return `'${stringValue}`;
  }
  return stringValue;
}
