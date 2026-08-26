/**
 * Registra este servidor MCP no Claude Code e/ou no Claude Desktop.
 *
 *   npm run register              registra nos hosts encontrados
 *   npm run register -- --code    somente Claude Code
 *   npm run register -- --desktop somente Claude Desktop
 *   npm run register -- --print   nao altera nada, so mostra a configuracao
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entryPoint = path.join(projectRoot, "dist", "index.js");
const SERVER_NAME = "solibri";

const args = process.argv.slice(2);
const only = {
  code: args.includes("--code"),
  desktop: args.includes("--desktop"),
};
const printOnly = args.includes("--print");
const wantsAll = !only.code && !only.desktop;

if (!fs.existsSync(entryPoint)) {
  console.error(`Build ausente: ${entryPoint}`);
  console.error("Rode primeiro: npm install && npm run build");
  process.exit(1);
}

const serverConfig = {
  command: "node",
  args: [entryPoint],
};

if (printOnly) {
  console.log(JSON.stringify({ mcpServers: { [SERVER_NAME]: serverConfig } }, null, 2));
  process.exit(0);
}

/* ------------------------------- Claude Code ------------------------------- */

function registerClaudeCode() {
  const command = process.platform === "win32" ? "claude.cmd" : "claude";
  try {
    execFileSync(command, ["mcp", "remove", SERVER_NAME, "--scope", "user"], {
      stdio: "ignore",
    });
  } catch {
    // Servidor ainda nao registrado: seguir adiante.
  }

  try {
    const output = execFileSync(
      command,
      ["mcp", "add", SERVER_NAME, "--scope", "user", "--", "node", entryPoint],
      { encoding: "utf8" },
    );
    console.log(`Claude Code: registrado. ${output.trim()}`);
    return true;
  } catch (error) {
    console.log("Claude Code: CLI 'claude' nao encontrado ou falhou.");
    console.log("  Registre manualmente com:");
    console.log(`  claude mcp add ${SERVER_NAME} --scope user -- node "${entryPoint}"`);
    return false;
  }
}

/* ------------------------------ Claude Desktop ----------------------------- */

function claudeDesktopConfigPath() {
  if (process.platform === "win32") {
    const appData = process.env["APPDATA"];
    if (!appData) return undefined;
    return path.join(appData, "Claude", "claude_desktop_config.json");
  }
  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json",
    );
  }
  return path.join(os.homedir(), ".config", "Claude", "claude_desktop_config.json");
}

function registerClaudeDesktop() {
  const configPath = claudeDesktopConfigPath();
  if (!configPath) {
    console.log("Claude Desktop: nao foi possivel determinar a pasta de configuracao.");
    return false;
  }

  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) {
    console.log(`Claude Desktop: nao instalado (${configDir} nao existe).`);
    return false;
  }

  let config = {};
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch {
      console.error(`Claude Desktop: ${configPath} tem JSON invalido. Corrija antes de registrar.`);
      return false;
    }
    // Backup antes de qualquer alteracao.
    const backup = `${configPath}.backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    fs.copyFileSync(configPath, backup);
    console.log(`Claude Desktop: backup em ${path.basename(backup)}`);
  }

  config.mcpServers = { ...(config.mcpServers ?? {}), [SERVER_NAME]: serverConfig };
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  console.log(`Claude Desktop: registrado em ${configPath}`);
  console.log("  Reinicie o Claude Desktop para carregar o servidor.");
  return true;
}

/* --------------------------------- Execucao -------------------------------- */

console.log(`Servidor: ${entryPoint}\n`);

let registered = 0;
if (wantsAll || only.code) registered += registerClaudeCode() ? 1 : 0;
if (wantsAll || only.desktop) registered += registerClaudeDesktop() ? 1 : 0;

console.log("");
if (registered === 0) {
  console.log("Nenhum host foi registrado automaticamente.");
  console.log("Use 'npm run register -- --print' para copiar a configuracao manualmente.");
  process.exit(1);
}
console.log(`Pronto. ${registered} host(s) registrado(s).`);
