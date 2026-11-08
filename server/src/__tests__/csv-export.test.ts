import { describe, it, expect } from 'vitest';
import Papa from 'papaparse';
import { csvCell } from '../csv-export';

function decoded(value: unknown) { return (Papa.parse(csvCell(value)).data as string[][])[0][0]; }
describe('spreadsheet-safe exports', () => {
  it.each(['=1+1', '+SUM(1,2)', '-cmd', '@SUM(A1)', '  =1+1', '\t=1+1', '\rhello'])('neutralizes text %j', value => {
    expect(decoded(value)).toBe("'" + value);
  });
  it('preserves numeric negatives and escapes quotes, commas and newlines', () => {
    expect(decoded(-250)).toBe('-250');
    expect(decoded('שם, "דייר"\nהערה')).toBe('שם, "דייר"\nהערה');
    expect(decoded(null)).toBe('');
  });
});
