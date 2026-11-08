/** Quote CSV fields and prevent spreadsheet formula evaluation in user text. */
export function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  // Numbers remain numeric, including legitimate negative amounts.
  // Control characters are deliberately checked to prevent formula-prefix bypasses.
  // eslint-disable-next-line no-control-regex
  if (typeof value !== 'number' && /^[\s\u0000-\u001f]*[=+@-]/u.test(text)) text = "'" + text;
  if (typeof value !== 'number' && /^[\t\r\n]/u.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
