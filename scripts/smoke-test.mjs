/**
 * Verifica que o servidor MCP sobe, registra as ferramentas e trata erros
 * quando o Solibri nao esta aberto. Rode com: npm run smoke
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const transport = new StdioClientTransport({
  command: process.platform === "win32" ? "npx.cmd" : "npx",
  args: ["tsx", "src/index.ts"],
  cwd: projectRoot,
  stderr: "pipe",
});

const client = new Client({ name: "smoke-test", version: "1.0.0" });
await client.connect(transport);

const { tools } = await client.listTools();
console.log(`Ferramentas registradas: ${tools.length}\n`);

for (const tool of tools) {
  const a = tool.annotations ?? {};
  const kind = a.readOnlyHint ? "leitura   " : a.destructiveHint ? "DESTRUTIVA" : "escrita   ";
  const params = Object.keys(tool.inputSchema?.properties ?? {});
  console.log(`  [${kind}] ${tool.name}(${params.join(", ")})`);
}

console.log("\n-- solibri_ping (erro tratado se o Solibri estiver fechado) --");
const ping = await client.callTool({ name: "solibri_ping", arguments: {} });
console.log(`isError=${ping.isError} :: ${ping.content[0].text.slice(0, 200)}`);

console.log("\n-- solibri_list_workspace --");
const ws = await client.callTool({ name: "solibri_list_workspace", arguments: {} });
console.log(ws.content[0].text.slice(0, 400));

console.log("\n-- validacao de caminho fora do workspace (deve falhar) --");
const escape = await client.callTool({
  name: "solibri_read_bcf",
  arguments: { file: "../../../Windows/System32/drivers/etc/hosts" },
});
console.log(`isError=${escape.isError} :: ${escape.content[0].text.slice(0, 200)}`);

console.log("\n-- validacao de GUID invalido (deve falhar) --");
const badGuid = await client.callTool({
  name: "solibri_show_component_info",
  arguments: { guid: "nao-e-um-guid" },
});
console.log(`isError=${badGuid.isError} :: ${badGuid.content[0].text.slice(0, 200)}`);

await client.close();
