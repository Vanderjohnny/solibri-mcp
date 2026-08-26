import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { detectSolibriExecutable } from "./detect.js";

function env(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

/** Raiz do projeto (um nivel acima de src/ ou dist/). */
export const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/**
 * Base da REST API local do Solibri.
 * O default do Solibri e HTTPS com certificado autoassinado; inicie o Solibri
 * com --rest-api-server-http para usar HTTP simples.
 */
export const SOLIBRI_BASE_URL = env(
  "SOLIBRI_BASE_URL",
  "http://127.0.0.1:10876/solibri/v1",
).replace(/\/+$/, "");

/** Timeout padrao das chamadas REST, em milissegundos. */
export const REST_TIMEOUT_MS = Number(env("SOLIBRI_TIMEOUT_MS", "60000"));

/**
 * Executavel do Solibri, usado apenas pelo Autorun.
 * Detectado automaticamente; defina SOLIBRI_EXE apenas se a instalacao estiver
 * fora dos locais padrao.
 */
export const SOLIBRI_EXE =
  process.env["SOLIBRI_EXE"] && process.env["SOLIBRI_EXE"] !== ""
    ? process.env["SOLIBRI_EXE"]
    : (detectSolibriExecutable() ??
      (process.platform === "darwin"
        ? "/Applications/Solibri.app/Contents/MacOS/Solibri"
        : "C:\Program Files\Solibri\SOLIBRI\Solibri.exe"));

/** Unica pasta em que o MCP pode ler e gravar arquivos. */
export const WORKSPACE = path.resolve(
  env("SOLIBRI_WORKSPACE", path.join(PROJECT_ROOT, "workspace")),
);

export const WORKSPACE_DIRS = {
  models: path.join(WORKSPACE, "models"),
  rulesets: path.join(WORKSPACE, "rulesets"),
  reports: path.join(WORKSPACE, "reports"),
  bcf: path.join(WORKSPACE, "bcf"),
  temp: path.join(WORKSPACE, "temp"),
} as const;

export function ensureWorkspace(): void {
  for (const dir of [WORKSPACE, ...Object.values(WORKSPACE_DIRS)]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Permite que o Autorun execute qualquer ruleset dentro do workspace.
 * Com SOLIBRI_STRICT_RULESETS=1, apenas os listados em config/approved-rulesets.json.
 */
export const STRICT_RULESETS = env("SOLIBRI_STRICT_RULESETS", "0") === "1";

export function approvedRulesets(): string[] {
  const file = path.join(PROJECT_ROOT, "config", "approved-rulesets.json");
  if (!fs.existsSync(file)) return [];
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? parsed.filter((r): r is string => typeof r === "string") : [];
  } catch {
    return [];
  }
}
