/**
 * Verifica que o servidor MCP sobe, registra as ferramentas e trata erros
 * quando o Solibri nao esta aberto. Rode com: npm run smoke
 *
 * Testa o mesmo comando que o usuario final executa (node dist/index.js),
 * e nao a versao TypeScript, para pegar problemas de build e de runtime.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entryPoint = path.join(projectRoot, "dist", "index.js");

if (!fs.existsSync(entryPoint)) {
  console.error(`Build ausente: ${entryPoint}\nRode: npm run build`);
  process.exit(1);
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [entryPoint],
  cwd: projectRoot,
  stderr: "pipe",
});

// O stderr do servidor carrega a causa real de qualquer falha de inicializacao.
const serverLog = [];
transport.stderr?.on("data", (chunk) => serverLog.push(chunk.toString()));

function reportServerLog() {
  if (serverLog.length === 0) return;
  console.error("\n--- stderr do servidor ---");
  console.error(serverLog.join("").trim());
  console.error("--- fim do stderr ---\n");
}

const client = new Client({ name: "smoke-test", version: "1.0.0" });

try {
  await client.connect(transport);
} catch (error) {
  console.error(`Falha ao conectar no servidor MCP: ${error.message}`);
  reportServerLog();
  process.exit(1);
}

let failures = 0;

function expect(label, condition, detail) {
  const status = condition ? "OK  " : "FALHA";
  if (!condition) failures += 1;
  console.log(`[${status}] ${label}${detail ? ` — ${detail}` : ""}`);
}

const { tools } = await client.listTools();
console.log(`Ferramentas registradas: ${tools.length}\n`);

for (const tool of tools) {
  const a = tool.annotations ?? {};
  const kind = a.readOnlyHint ? "leitura   " : a.destructiveHint ? "DESTRUTIVA" : "escrita   ";
  const params = Object.keys(tool.inputSchema?.properties ?? {});
  console.log(`  [${kind}] ${tool.name}(${params.join(", ")})`);
}

console.log("");
expect("25 ferramentas registradas", tools.length === 25, `encontradas ${tools.length}`);

const ping = await client.callTool({ name: "solibri_ping", arguments: {} });
expect(
  "Solibri fechado devolve erro tratado",
  ping.isError === true && /REST API do Solibri/.test(ping.content[0].text),
  ping.content[0].text.slice(0, 90),
);

const ws = await client.callTool({ name: "solibri_list_workspace", arguments: {} });
expect("Workspace acessivel", ws.isError !== true, JSON.parse(ws.content[0].text).workspace);

const escape = await client.callTool({
  name: "solibri_read_bcf",
  arguments: { file: "../../../etc/passwd" },
});
expect(
  "Escape do workspace bloqueado",
  escape.isError === true && /fora da pasta autorizada/.test(escape.content[0].text),
  escape.content[0].text.slice(0, 60),
);

const badGuid = await client.callTool({
  name: "solibri_show_component_info",
  arguments: { guid: "nao-e-um-guid" },
});
expect(
  "GUID invalido bloqueado",
  badGuid.isError === true && /GUID IFC invalido/.test(badGuid.content[0].text),
  badGuid.content[0].text.slice(0, 60),
);

await client.close();

console.log("");
if (failures > 0) {
  console.error(`${failures} verificacao(oes) falharam.`);
  reportServerLog();
  process.exit(1);
}
console.log("Smoke test concluido sem falhas.");
