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
const client = new Client({ name: "bcf-test", version: "1.0.0" });
await client.connect(transport);

const res = await client.callTool({
  name: "solibri_read_bcf",
  arguments: { file: "bcf/teste.bcf", sortBySeverity: true, includeComments: true },
});
console.log(res.content[0].text);
await client.close();
