/**
 * Diagnostico da instalacao. Rode com: npm run doctor
 * Mostra em uma tela o que esta pronto e o que falta.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function check(name, passed, detail) {
  checks.push({ name, passed, detail });
  const mark = passed === true ? "OK  " : passed === "warn" ? "AVISO" : "FALHA";
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ""}`);
}

console.log("Diagnostico do MCP Solibri\n");

/* Node */
const major = Number(process.versions.node.split(".")[0]);
check("Node.js 20 ou superior", major >= 20, `versao ${process.versions.node}`);

/* Dependencias e build */
check(
  "Dependencias instaladas",
  fs.existsSync(path.join(projectRoot, "node_modules", "@modelcontextprotocol", "sdk")),
  "npm install",
);

const entryPoint = path.join(projectRoot, "dist", "index.js");
check("Build presente", fs.existsSync(entryPoint), fs.existsSync(entryPoint) ? entryPoint : "rode npm run build");

/* Solibri instalado */
let solibriExe;
try {
  const { findSolibriExecutables } = await import("../dist/detect.js");
  const found = findSolibriExecutables();
  solibriExe = process.env["SOLIBRI_EXE"] || found[0];
  check(
    "Solibri instalado",
    Boolean(solibriExe) && fs.existsSync(solibriExe),
    solibriExe ?? "nao encontrado nos locais padrao; defina SOLIBRI_EXE",
  );
  if (found.length > 1) {
    console.log(`         outras instalacoes: ${found.slice(1).join(", ")}`);
  }
} catch {
  check("Solibri instalado", "warn", "rode npm run build antes do diagnostico");
}

/* Workspace */
const workspace = process.env["SOLIBRI_WORKSPACE"] || path.join(projectRoot, "workspace");
check("Workspace acessivel", fs.existsSync(workspace) || true, workspace);

/* REST API */
const baseUrl = (process.env["SOLIBRI_BASE_URL"] || "http://127.0.0.1:10876/solibri/v1").replace(/\/+$/, "");

let restOk = false;
try {
  const { Agent, fetch: undiciFetch } = await import("undici");
  const url = new URL(`${baseUrl}/ping`);
  const dispatcher =
    url.protocol === "https:" ? new Agent({ connect: { rejectUnauthorized: false } }) : undefined;

  const response = await undiciFetch(url, {
    dispatcher,
    signal: AbortSignal.timeout(4000),
  });
  const body = (await response.text()).slice(0, 60);
  restOk = response.ok;
  check("REST API do Solibri respondendo", response.ok, `${baseUrl} → ${body || response.status}`);
} catch {
  check("REST API do Solibri respondendo", "warn", `${baseUrl} nao respondeu`);
}

if (!restOk) {
  console.log("\n  Para ligar a REST API, feche o Solibri e reabra assim:");
  const exe = solibriExe ?? "C:\Program Files\Solibri\SOLIBRI\Solibri.exe";
  console.log(`  "${exe}" --rest-api-server-port=10876 --rest-api-server-http`);
  console.log("  No Windows, o atalho 'Iniciar Solibri com REST API.bat' ja faz isso.");
}

const failures = checks.filter((c) => c.passed !== true && c.passed !== "warn");
console.log("");
if (failures.length === 0) {
  console.log("Tudo pronto." + (restOk ? "" : " A REST API so e necessaria com o Solibri aberto."));
} else {
  console.log(`${failures.length} item(ns) precisam de atencao.`);
  process.exitCode = 1;
}
