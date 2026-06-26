import type { SliceCandidate, SliceDiagnosis } from "./types.js";

const PATTERNS: Record<string, { pattern: string; why: string; inspect: string[] }> = {
  god_file: {
    pattern: "Extract Module",
    why: "This file is large and exports many things, which usually means several responsibilities are tangled together.",
    inspect: ["responsibility boundaries", "public imports of each export", "test coverage for moved exports"],
  },
  high_complexity: {
    pattern: "Extract Function",
    why: "This callable has high fan-in or fan-out, so changes can be hard to reason about and easy to break.",
    inspect: ["side effects", "shared mutable state", "callers that rely on subtle behavior"],
  },
  dead_export: {
    pattern: "Remove Dead Code",
    why: "This export appears unused by the scanned TypeScript call graph and may be obsolete API surface.",
    inspect: ["dynamic imports", "external package consumers", "CLI or config references"],
  },
  tight_coupling: {
    pattern: "Introduce Interface",
    why: "These modules appear to depend on each other in both directions, making isolated changes harder.",
    inspect: ["shared domain types", "dependency direction", "cycles hidden behind barrel files"],
  },
  hub_creep: {
    pattern: "Facade Pattern",
    why: "This callable reaches into many distinct areas, which can turn it into an orchestration bottleneck.",
    inspect: ["which calls are orchestration vs business logic", "error handling paths", "transaction boundaries"],
  },
  trivial_helper: {
    pattern: "Inline Function",
    why: "This tiny helper has only one apparent caller, so the indirection may cost more than it clarifies.",
    inspect: ["whether the name documents intent", "future reuse plans", "test references"],
  },
  singleton_utils_file: {
    pattern: "Move to Module",
    why: "A utils/helpers file with one export often indicates a homeless helper that belongs near its consumer.",
    inspect: ["single consumer location", "barrel exports", "naming after domain concepts"],
  },
};

export async function diagnoseCandidate(candidate: SliceCandidate): Promise<SliceDiagnosis> {
  const info = PATTERNS[candidate.smell] ?? { pattern: "Refactor", why: "This candidate may benefit from a small, focused refactor.", inspect: ["tests", "callers", "runtime side effects"] };
  const blastRadius = Math.max(candidate.metrics.callerCount ?? 0, candidate.metrics.bidirectionalImports ?? 0, 0);
  const riskLevel = candidate.severity === "critical" || blastRadius > 20 ? "high" : candidate.severity === "high" || blastRadius > 5 ? "medium" : "low";
  return {
    candidate,
    recommendedPattern: info.pattern,
    patternSource: "builtin",
    toolSupport: [],
    riskLevel,
    blastRadius,
    rationale: `${info.pattern}: ${info.why} Risk is ${riskLevel}; inspect ${info.inspect.join(", ")} before changing it.`,
    inspectBeforeChanging: info.inspect,
  };
}
