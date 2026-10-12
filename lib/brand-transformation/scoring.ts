import type { AuditFinding } from "@/types/brand-transformation";

function weighted(findings: AuditFinding[], key: "current_score" | "target_score") {
  const totalWeight = findings.reduce((sum, item) => sum + Number(item.weight || 1), 0);
  if (!totalWeight) return 0;
  const score = findings.reduce(
    (sum, item) => sum + Number(item[key]) * Number(item.weight || 1),
    0,
  ) / totalWeight;
  return Math.round(score * 10) / 10;
}

export function calculateMetrics(findings: AuditFinding[], tasks: { status: string }[]) {
  const currentScore = weighted(findings, "current_score");
  const targetScore = weighted(findings, "target_score");
  return {
    currentScore,
    targetScore,
    transformationGap: Math.round((targetScore - currentScore) * 10) / 10,
    openFindings: findings.filter((f) => !["rejected", "resolved"].includes(f.status)).length,
    completedTasks: tasks.filter((task) => task.status === "done").length,
    totalTasks: tasks.length,
  };
}

