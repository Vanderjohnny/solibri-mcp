import path from "node:path";
import fs from "node:fs";
import { WORKSPACE, WORKSPACE_DIRS, STRICT_RULESETS, approvedRulesets } from "./config.js";

/**
 * Resolve um caminho informado pela LLM e garante que ele esteja dentro do
 * workspace autorizado. Aceita caminho relativo ("models/predio.ifc") ou
 * absoluto, desde que absoluto continue sob o workspace.
 */
export function resolveInWorkspace(userPath: string): string {
  if (typeof userPath !== "string" || userPath.trim() === "") {
    throw new Error("Caminho vazio.");
  }
  if (userPath.includes("\0")) {
    throw new Error("Caminho invalido.");
  }

  const resolved = path.resolve(WORKSPACE, userPath);
  const relative = path.relative(WORKSPACE, resolved);

  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(
      `Caminho fora da pasta autorizada. Permitido apenas dentro de ${WORKSPACE}.`,
    );
  }

  // Bloqueia symlinks que escapem do workspace.
  let probe = resolved;
  while (probe !== path.dirname(probe)) {
    if (fs.existsSync(probe)) {
      const real = fs.realpathSync(probe);
      const realRelative = path.relative(fs.realpathSync(WORKSPACE), real);
      if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
        throw new Error("Caminho aponta para fora da pasta autorizada.");
      }
      break;
    }
    probe = path.dirname(probe);
  }

  return resolved;
}

/** Igual a resolveInWorkspace, mas exige que o arquivo ja exista. */
export function resolveExistingFile(userPath: string): string {
  const resolved = resolveInWorkspace(userPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`Arquivo nao encontrado no workspace: ${userPath}`);
  }
  return resolved;
}

/** Valida a extensao de um arquivo contra uma lista permitida. */
export function assertExtension(filePath: string, allowed: readonly string[]): void {
  const ext = path.extname(filePath).toLowerCase();
  if (!allowed.includes(ext)) {
    throw new Error(
      `Extensao ${ext || "(nenhuma)"} nao permitida. Esperado: ${allowed.join(", ")}.`,
    );
  }
}

/** Resolve um ruleset, respeitando a lista aprovada quando o modo estrito esta ativo. */
export function resolveRuleset(userPath: string): string {
  const resolved = resolveExistingFile(userPath);
  assertExtension(resolved, [".cset", ".ids"]);

  if (STRICT_RULESETS) {
    const approved = approvedRulesets().map((r) => path.resolve(WORKSPACE_DIRS.rulesets, r));
    if (!approved.includes(resolved)) {
      throw new Error(
        "Ruleset nao esta na lista aprovada (config/approved-rulesets.json).",
      );
    }
  }
  return resolved;
}

/** GUID IFC: 22 caracteres do alfabeto base64 do IFC. */
const IFC_GUID = /^[0-9A-Za-z_$]{22}$/;

export function assertIfcGuid(guid: string): string {
  if (!IFC_GUID.test(guid)) {
    throw new Error(
      `GUID IFC invalido: "${guid}". Esperado 22 caracteres (ex.: 1hjKl2mNo3PqRsTuVwXyZ$).`,
    );
  }
  return guid;
}

/** UUID interno do Solibri (ex.: 66bbc0ca-4496-11e9-b210-d663bd873d93). */
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function assertModelUuid(uuid: string): string {
  if (!UUID.test(uuid)) {
    throw new Error(`UUID de modelo invalido: "${uuid}".`);
  }
  return uuid;
}
