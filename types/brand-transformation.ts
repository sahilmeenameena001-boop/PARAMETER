export type AuditStatus = "draft" | "in_review" | "approved" | "archived";
export type FindingStatus = "open" | "accepted" | "rejected" | "resolved";
export type Priority = "low" | "medium" | "high" | "critical";
export type TaskStatus = "backlog" | "todo" | "in_progress" | "review" | "done";

export interface Client {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  current_positioning: string | null;
  desired_positioning: string | null;
}

export interface AuditFinding {
  id: string;
  audit_id: string;
  category: string;
  element: string;
  current_score: number;
  target_score: number;
  weight: number;
  severity: Priority;
  observation: string;
  issues: string[];
  recommendations: string[];
  status: FindingStatus;
}

export interface BrandAudit {
  id: string;
  client_id: string;
  title: string;
  version: number;
  status: AuditStatus;
  source_text: string | null;
  findings: AuditFinding[];
}

export interface BrandToken {
  id: string;
  client_id: string;
  token_type: "colour" | "typography" | "logo" | "photography" | "website" | "social";
  name: string;
  value: Record<string, unknown>;
  status: "draft" | "approved" | "retired";
}

export interface TransformationTask {
  id: string;
  client_id: string;
  finding_id: string | null;
  title: string;
  description: string | null;
  priority: Priority;
  status: TaskStatus;
  output_required: string | null;
  due_date: string | null;
}

export interface DashboardPayload {
  client: Client;
  audit: BrandAudit | null;
  brandTokens: BrandToken[];
  tasks: TransformationTask[];
  metrics: {
    currentScore: number;
    targetScore: number;
    transformationGap: number;
    openFindings: number;
    completedTasks: number;
    totalTasks: number;
  };
}

