/**
 * Teste de integracao com o Solibri aberto e a REST API ativa.
 * Diferente do smoke test, exercita o caminho real de dados.
 * Rode com: npm run test:vivo
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(projectRoot, "dist", "index.js")],
  cwd: projectRoot,
  stderr: "pipe",
});

const client = new Client({ name: "teste-ao-vivo", version: "1.0.0" });
await client.connect(transport);

const chamar = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  return { erro: r.isError === true, texto: r.content[0].text };
};

const ping = await chamar("solibri_ping");
if (ping.erro) {
  console.error("Solibri nao esta acessivel. Abra pelo atalho 'Iniciar Solibri com REST API.bat'.");
  console.error(ping.texto);
  await client.close();
  process.exit(1);
}

let falhas = 0;
const ok = (label, cond, detalhe) => {
  if (!cond) falhas += 1;
  console.log(`[${cond ? "OK  " : "FALHA"}] ${label}${detalhe ? ` — ${detalhe}` : ""}`);
};

console.log("Teste de integracao com o Solibri aberto\n");

ok("ping responde pong", /pong/i.test(ping.texto));

const about = JSON.parse((await chamar("solibri_about")).texto);
ok("about traz produto e versao", Boolean(about.product && about.version),
  `${about.product} ${about.version}`);

const status = JSON.parse((await chamar("solibri_status")).texto);
ok("status traz o estado", typeof status.status === "string",
  `${status.status}, busy=${status.busy}`);

const modelos = JSON.parse((await chamar("solibri_list_models")).texto);
ok("lista de modelos e um array", Array.isArray(modelos), `${modelos.length} modelo(s)`);

const camera = JSON.parse((await chamar("solibri_get_camera")).texto);
ok("camera traz posicao e projecao",
  Boolean(camera.projection && camera.location), camera.projection);

const cesta = JSON.parse((await chamar("solibri_get_selection_basket")).texto);
ok("selection basket e um array", Array.isArray(cesta), `${cesta.length} componente(s)`);

// O endpoint /components esta quebrado no Solibri; o servidor deve explicar isso
// em vez de repassar um HTTP 500 sem contexto.
if (modelos.length > 0) {
  const comps = await chamar("solibri_get_model_components", { modelUuid: modelos[0].uuid });
  ok("components explica a falha do Solibri",
    !comps.erro || /esta quebrado no Solibri/.test(comps.texto),
    comps.erro ? "erro explicado" : "endpoint respondeu");
}

// Sem issues no projeto, exportar deve avisar em vez de gravar um BCF vazio.
const bcf = JSON.parse((await chamar("solibri_export_bcf", { output: "bcf/_teste.bcf" })).texto);
ok("export_bcf trata projeto sem issues",
  bcf.exported === true || (bcf.exported === false && Boolean(bcf.reason)),
  bcf.exported ? `${bcf.bytes} bytes` : "sem issues, nada gravado");

await client.close();

console.log("");
if (falhas > 0) {
  console.error(`${falhas} verificacao(oes) falharam.`);
  process.exit(1);
}
console.log("Integracao com o Solibri validada.");
