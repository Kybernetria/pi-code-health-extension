export type DocHygieneSignal = "stale" | "archive_candidate" | "needs_review" | "missing_title";

export interface DocHygieneFinding {
  file: string;
  signal: DocHygieneSignal;
  severity: "low" | "medium" | "high";
  reason: string;
}

export interface DocHygieneScanParams {
  rootDir?: string;
  files?: string[];
  maxResults?: number;
}
