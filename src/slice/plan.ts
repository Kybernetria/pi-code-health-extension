import { createHash } from "node:crypto";
import type { SliceDiagnosis, SliceOperation, SlicePlan, SliceStep } from "./types.js";

const TEMPLATES: Record<string, Array<{ op: SliceOperation; desc: string; deps: number[] }>> = {
  "Extract Module": [
    { op: "split_file", desc: "Identify responsibility groups in {FILE}", deps: [] },
    { op: "move_to_module", desc: "Move each group into a focused module", deps: [1] },
    { op: "replace_pattern", desc: "Update imports and add compatibility re-exports if needed", deps: [2] },
  ],
  "Extract Function": [
    { op: "extract_function", desc: "Find cohesive blocks inside {FUNC} in {FILE}", deps: [] },
    { op: "extract_function", desc: "Extract named helpers with explicit inputs and outputs", deps: [1] },
  ],
  "Remove Dead Code": [
    { op: "remove_dead_code", desc: "Verify {FUNC} in {FILE} is not referenced dynamically", deps: [] },
    { op: "remove_dead_code", desc: "Remove the export and its tests or update tests", deps: [1] },
  ],
  "Introduce Interface": [
    { op: "introduce_interface", desc: "Define a stable interface at the dependency boundary", deps: [] },
    { op: "replace_pattern", desc: "Make {FILE} depend on the interface rather than concrete peer modules", deps: [1] },
  ],
  "Facade Pattern": [
    { op: "introduce_interface", desc: "Define a facade for {FUNC} orchestration", deps: [] },
    { op: "move_to_module", desc: "Move scattered orchestration behind the facade", deps: [1] },
  ],
  "Inline Function": [
    { op: "inline", desc: "Inline {FUNC} into its single caller", deps: [] },
    { op: "remove_dead_code", desc: "Delete the now-empty wrapper export", deps: [1] },
  ],
  "Move to Module": [
    { op: "move_to_module", desc: "Move the single helper from {FILE} next to its consumer", deps: [] },
  ],
};

export async function generateSlicePlan(diagnosis: SliceDiagnosis): Promise<SlicePlan> {
  const steps = (TEMPLATES[diagnosis.recommendedPattern] ?? [{ op: "replace_pattern" as const, desc: "Apply {PATTERN} to {FILE}", deps: [] }]).map((step, i): SliceStep => ({
    order: i + 1,
    file: diagnosis.candidate.file,
    operation: step.op,
    description: step.desc
      .replaceAll("{FILE}", diagnosis.candidate.file)
      .replaceAll("{FUNC}", diagnosis.candidate.functionName ?? "the file-level candidate")
      .replaceAll("{PATTERN}", diagnosis.recommendedPattern),
    expectedDelta: delta(step.op, diagnosis.candidate.metrics.loc),
    dependsOn: step.deps,
  }));
  const id = createHash("sha256").update(JSON.stringify({ c: diagnosis.candidate, p: diagnosis.recommendedPattern })).digest("hex").slice(0, 12);
  return { id, diagnosis, steps, estimatedEffort: estimateEffort(steps.length, diagnosis.blastRadius), totalBlastRadius: diagnosis.blastRadius, citations: [] };
}

function delta(op: SliceOperation, loc = 20) {
  if (op === "remove_dead_code") return { loc: -loc };
  if (op === "extract_function") return { complexity: -3, loc: -20 };
  if (op === "move_to_module" || op === "introduce_interface" || op === "split_file") return { coupling: -3 };
  return {};
}
export function estimateEffort(stepCount: number, blastRadius: number): SlicePlan["estimatedEffort"] {
  if (stepCount <= 2 && blastRadius <= 3) return "trivial";
  if (stepCount <= 5 && blastRadius <= 10) return "small";
  if (stepCount <= 10 && blastRadius <= 25) return "medium";
  return "large";
}
