import type { ChildProcess } from "node:child_process";

export type JobState = "running" | "succeeded" | "failed" | "cancelled";

export interface Job {
  id: string;
  kind: string;
  state: JobState;
  startedAt: string;
  finishedAt?: string;
  exitCode?: number | null;
  /** Ultimas linhas de saida do processo, para diagnostico. */
  log: string[];
  /** Arquivos que o job deve produzir, em caminho relativo ao workspace. */
  outputs: string[];
  error?: string;
  process?: ChildProcess;
}

const jobs = new Map<string, Job>();
let counter = 0;

const MAX_LOG_LINES = 200;

export function createJob(kind: string, outputs: string[]): Job {
  counter += 1;
  const id = `${kind}-${String(counter).padStart(4, "0")}`;
  const job: Job = {
    id,
    kind,
    state: "running",
    startedAt: new Date().toISOString(),
    log: [],
    outputs,
  };
  jobs.set(id, job);
  return job;
}

export function appendLog(job: Job, chunk: string): void {
  for (const line of chunk.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    job.log.push(line);
  }
  if (job.log.length > MAX_LOG_LINES) {
    job.log.splice(0, job.log.length - MAX_LOG_LINES);
  }
}

export function finishJob(job: Job, state: JobState, exitCode?: number | null, error?: string): void {
  job.state = state;
  job.finishedAt = new Date().toISOString();
  job.exitCode = exitCode ?? null;
  if (error) job.error = error;
  job.process = undefined;
}

export function getJob(id: string): Job {
  const job = jobs.get(id);
  if (!job) throw new Error(`Job desconhecido: ${id}`);
  return job;
}

export function listJobs(): Job[] {
  return [...jobs.values()];
}

/** Representacao segura para enviar a LLM (sem o handle do processo). */
export function describeJob(job: Job) {
  return {
    jobId: job.id,
    kind: job.kind,
    state: job.state,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    exitCode: job.exitCode,
    outputs: job.outputs,
    error: job.error,
    logTail: job.log.slice(-25),
  };
}
