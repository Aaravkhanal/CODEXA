/**
 * CODEXA — Skills, Repository, and Advanced Capability Specifications
 */

export interface SkillManifest {
  name: string;
  version: string;
  description: string;
  category?: string;
  whenToUse: string[];
  requiredTools: string[];
  recommendedWorkflow: string[];
  constraints: string[];
  examples: { title: string; prompt: string; code?: string }[];
  commonErrors: { error: string; recovery: string }[];
  sourcePath?: string;
  isProjectSkill?: boolean;
}

export interface ProjectKnowledgeGraph {
  projectName: string;
  frameworks: string[];
  languages: string[];
  packageManager: string;
  testFramework?: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  entryPoints: string[];
  architectureNotes: string[];
  databaseType?: string;
  routes: string[];
  indexedAt: string;
}

export interface RepositoryAnalysis {
  url: string;
  name: string;
  description?: string;
  framework: string;
  language: string;
  packageManager: string;
  entryPoints: string[];
  architecture: string;
  dependencies: string[];
  importantFiles: string[];
  integrationPoints: string[];
  license?: string;
  environmentVariables: string[];
}

export interface DependencyPlan {
  alreadyInstalled: string[];
  missing: string[];
  packageManager: "bun" | "npm" | "pnpm" | "yarn" | "pip" | "cargo" | "go";
  installCommand: string;
}

export type RiskLevel = "SAFE" | "MODERATE" | "HIGH_RISK";

export interface PermissionCheckResult {
  command: string;
  riskLevel: RiskLevel;
  reason: string;
  requiresConfirmation: boolean;
}

export interface CheckpointMetadata {
  id: string;
  timestamp: string;
  description: string;
  filesSnapshot: string[];
  gitHead?: string;
}

export interface TaskState {
  taskId: string;
  status: "pending" | "running" | "completed" | "failed";
  stepIndex: number;
  steps: {
    name: string;
    phase: string;
    completed: boolean;
    error?: string;
  }[];
  checkpoints: string[];
  createdAt: string;
  updatedAt: string;
}
