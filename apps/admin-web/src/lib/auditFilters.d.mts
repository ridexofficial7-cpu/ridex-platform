export interface AuditFilters {
  fromDate?: string;
  toDate?: string;
  actor?: string;
  role?: string;
  target?: string;
  result?: string;
}
export function auditRecordMatchesFilters(row: Record<string, unknown>, filters?: AuditFilters): boolean;
export function filterAuditRecords(records: unknown, filters?: AuditFilters): Record<string, unknown>[];
