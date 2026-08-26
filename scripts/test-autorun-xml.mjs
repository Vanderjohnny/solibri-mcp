/** Valida a geracao do XML do Autorun sem executar o Solibri. */
import { buildAutorunXml } from "../src/autorun.ts";

console.log("--- XML gerado ---");
const okCase = buildAutorunXml({
  models: ["models/teste.ifc"],
  rulesets: ["rulesets/coordenacao.cset"],
  bcfOutput: "bcf/coordenacao.bcf",
  reportOutput: "reports/coordenacao.xlsx",
  smcOutput: "temp/projeto.smc",
});
console.log(okCase.xml);
console.log("outputs:", okCase.outputs);

console.log("\n--- modelo fora do workspace (deve falhar) ---");
try {
  buildAutorunXml({ models: ["C:/Windows/System32/config/SAM"] });
  console.log("FALHA: deveria ter sido bloqueado");
} catch (e) {
  console.log("bloqueado:", e.message);
}

console.log("\n--- extensao invalida (deve falhar) ---");
try {
  buildAutorunXml({ models: ["models/teste.ifc"], bcfOutput: "bcf/saida.exe" });
  console.log("FALHA: deveria ter sido bloqueado");
} catch (e) {
  console.log("bloqueado:", e.message);
}

console.log("\n--- injecao de XML no nome de arquivo (deve escapar ou bloquear) ---");
try {
  buildAutorunXml({ models: ['models/teste.ifc'], bcfOutput: 'bcf/a" /><exit /><x b=".bcf' });
  console.log("gerou (verifique escape acima)");
} catch (e) {
  console.log("bloqueado:", e.message);
}
