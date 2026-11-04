import type { Server } from 'node:http';
export interface ManagedWorkspace {
  basePath: string;
  brandName: string;
  settingsUrl: string;
  promptsUrl: string;
  responsesUrl: string;
  project: { site: string; competitors?: string[]; workflows?: string[]; country?: string };
  refreshContext?(): Promise<{ brandName: string; settingsUrl: string; promptsUrl: string; responsesUrl: string; project: ManagedWorkspace["project"] }>;
  getKey(): Promise<string>;
  addQuestions(input: { sourceRunId: string; questions: { id: string; text: string }[] }): Promise<unknown>;
}
export interface Workbench {
  server: Server;
  request(request: Request): Promise<Response>;
  close(): Promise<void>;
  dataDir: string;
}
export function createWorkbench(options?: {
  dataDir?: string;
  credentialFile?: string;
  initialKey?: string;
  fetchImpl?: typeof fetch;
  managed?: ManagedWorkspace;
  assets?: Record<string, string>;
  demoSnapshot?: unknown;
  demoConfig?: unknown;
}): Promise<Workbench>;
export function startWorkbench(options?: Parameters<typeof createWorkbench>[0] & { port?: number }): Promise<Workbench>;
