import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { SOLIBRI_EXE, WORKSPACE, WORKSPACE_DIRS } from "./config.js";
import { resolveExistingFile, resolveInWorkspace, resolveRuleset, assertExtension } from "./security.js";
import { appendLog, createJob, finishJob, type Job } from "./jobs.js";

export interface AutorunRequest {
  /** IFCs a abrir, em caminhos relativos ao workspace. */
  models: string[];
  /** Rulesets .cset ou regras .ids. Opcional: sem eles, apenas abre os modelos. */
  rulesets?: string[];
  /** Gera comentarios automaticos nas issues encontradas. */
  autocomment?: boolean;
  /** Cria a apresentacao de resultados no projeto. */
  createPresentation?: boolean;
  /** Caminho de saida do BCF, relativo ao workspace. */
  bcfOutput?: string;
  bcfVersion?: "2.1" | "3.0";
  /** Caminho de saida do relatorio Excel/PDF, relativo ao workspace. */
  reportOutput?: string;
  /** Salva o projeto .smc ao final. */
  smcOutput?: string;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Monta o XML de tarefas do Autorun a partir de um pedido ja validado. */
export function buildAutorunXml(request: AutorunRequest): { xml: string; outputs: string[] } {
  const tasks: string[] = [];
  const outputs: string[] = [];

  if (request.models.length === 0) {
    throw new Error("Informe ao menos um modelo IFC.");
  }

  for (const model of request.models) {
    const resolved = resolveExistingFile(model);
    assertExtension(resolved, [".ifc", ".ifcxml", ".ifczip"]);
    tasks.push(`    <openmodel file="${xmlEscape(resolved)}" />`);
  }

  for (const ruleset of request.rulesets ?? []) {
    const resolved = resolveRuleset(ruleset);
    tasks.push(`    <openruleset file="${xmlEscape(resolved)}" />`);
  }

  if ((request.rulesets ?? []).length > 0) {
    tasks.push("    <check />");
    if (request.autocomment !== false) {
      tasks.push('    <autocomment zoom="TRUE" />');
    }
    if (request.createPresentation !== false) {
      tasks.push("    <createpresentation />");
    }
  }

  if (request.bcfOutput) {
    const resolved = resolveInWorkspace(request.bcfOutput);
    assertExtension(resolved, [".bcf", ".bcfzip"]);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    const version = request.bcfVersion ?? "2.1";
    tasks.push(`    <bcfreport file="${xmlEscape(resolved)}" version="${version}" />`);
    outputs.push(path.relative(WORKSPACE, resolved).split(path.sep).join("/"));
  }

  if (request.reportOutput) {
    const resolved = resolveInWorkspace(request.reportOutput);
    assertExtension(resolved, [".xlsx", ".pdf", ".rtf", ".html"]);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    tasks.push(`    <report file="${xmlEscape(resolved)}" />`);
    outputs.push(path.relative(WORKSPACE, resolved).split(path.sep).join("/"));
  }

  if (request.smcOutput) {
    const resolved = resolveInWorkspace(request.smcOutput);
    assertExtension(resolved, [".smc"]);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    tasks.push(`    <savemodel file="${xmlEscape(resolved)}" />`);
    outputs.push(path.relative(WORKSPACE, resolved).split(path.sep).join("/"));
  }

  tasks.push("    <exit />");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<batch name="MCP Solibri" default="run">
  <target name="run">
${tasks.join("\n")}
  </target>
</batch>
`;

  return { xml, outputs };
}

/** Grava o XML no workspace e dispara o Solibri em modo Autorun. */
export function startAutorun(request: AutorunRequest): Job {
  if (!fs.existsSync(SOLIBRI_EXE)) {
    throw new Error(
      `Executavel do Solibri nao encontrado em ${SOLIBRI_EXE}. Ajuste SOLIBRI_EXE no .env.`,
    );
  }

  const { xml, outputs } = buildAutorunXml(request);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const xmlPath = path.join(WORKSPACE_DIRS.temp, `autorun-${stamp}.xml`);
  fs.mkdirSync(path.dirname(xmlPath), { recursive: true });
  fs.writeFileSync(xmlPath, xml, "utf8");

  const job = createJob("check", outputs);
  appendLog(job, `Autorun XML: ${xmlPath}`);

  // shell: false — nenhum argumento passa pelo interpretador de comandos.
  const child = spawn(SOLIBRI_EXE, [xmlPath], { shell: false, windowsHide: false });
  job.process = child;

  child.stdout?.on("data", (data: Buffer) => appendLog(job, data.toString()));
  child.stderr?.on("data", (data: Buffer) => appendLog(job, data.toString()));

  child.on("error", (error) => {
    finishJob(job, "failed", null, error.message);
  });

  child.on("exit", (code) => {
    if (job.state !== "running") return;
    const missing = outputs.filter((out) => !fs.existsSync(path.join(WORKSPACE, out)));
    if (code === 0 && missing.length === 0) {
      finishJob(job, "succeeded", code);
    } else {
      finishJob(
        job,
        "failed",
        code,
        missing.length > 0
          ? `Solibri terminou com codigo ${code}, mas nao gerou: ${missing.join(", ")}.`
          : `Solibri terminou com codigo ${code}.`,
      );
    }
  });

  return job;
}

export function cancelAutorun(job: Job): void {
  if (job.state !== "running" || !job.process) {
    throw new Error(`Job ${job.id} nao esta em execucao.`);
  }
  job.process.kill();
  finishJob(job, "cancelled", null, "Cancelado pelo usuario.");
}
