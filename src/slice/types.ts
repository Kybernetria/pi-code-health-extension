export type SmellType =
  | "god_file"
  | "high_complexity"
  | "dead_export"
  | "tight_coupling"
  | "hub_creep"
  | "singleton_utils_file"
  | "trivial_helper";

export type Severity = "low" | "medium" | "high" | "critical";

export interface CandidateMetrics {
  loc?: number;
  callerCount?: number;
  calleeCount?: number;
  exportCount?: number;
  bidirectionalImports?: number;
  distinctFiles?: number;
}

export interface SliceCandidate {
  file: string;
  functionName?: string;
  smell: SmellType;
  severity: Severity;
  metrics: CandidateMetrics;
  impactScore: number;
}

export interface ScanParams {
  rootDir?: string;
  files?: string[];
  minSeverity?: Severity;
  smells?: SmellType[];
  maxResults?: number;
}

export interface SliceDiagnosis {
  candidate: SliceCandidate;
  recommendedPattern: string;
  patternSource: "builtin";
  toolSupport: string[];
  riskLevel: "low" | "medium" | "high";
  blastRadius: number;
  rationale: string;
  inspectBeforeChanging: string[];
}

export type SliceOperation =
  | "extract_function"
  | "move_to_module"
  | "split_file"
  | "rename"
  | "inline"
  | "replace_pattern"
  | "remove_dead_code"
  | "introduce_interface";

export interface SliceStep {
  order: number;
  file: string;
  operation: SliceOperation;
  description: string;
  expectedDelta: { complexity?: number; coupling?: number; loc?: number };
  dependsOn: number[];
}

export interface SlicePlan {
  id: string;
  diagnosis: SliceDiagnosis;
  steps: SliceStep[];
  estimatedEffort: "trivial" | "small" | "medium" | "large";
  totalBlastRadius: number;
  citations: string[];
}
