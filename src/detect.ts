import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * Descobre o executavel do Solibri instalado na maquina.
 * Evita que cada usuario precise editar caminho a mao: so use SOLIBRI_EXE
 * quando a instalacao estiver fora dos locais padrao.
 */

function windowsRoots(): string[] {
  const roots = [
    process.env["ProgramFiles"] ?? "C:\Program Files",
    process.env["ProgramFiles(x86)"] ?? "C:\Program Files (x86)",
    process.env["LOCALAPPDATA"] ?? "",
  ].filter((root) => root !== "");

  // Nomes de pasta usados pelos produtos Solibri ao longo das versoes.
  const brands = ["Solibri", "Solibri Anywhere", "Solibri Office", "Solibri Site"];

  const candidates: string[] = [];
  for (const root of roots) {
    for (const brand of brands) {
      candidates.push(path.join(root, brand));
    }
  }
  return candidates;
}

/**
 * Consulta o registro do Windows pelo script PowerShell do projeto.
 * E a fonte mais confiavel: encontra a instalacao em qualquer disco, nao so em
 * Program Files, e devolve a versao mais nova primeiro.
 */
function searchRegistry(): string[] {
  if (process.platform !== "win32") return [];

  // Raiz calculada aqui, e nao importada de config.ts, para evitar ciclo de import.
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const script = path.join(projectRoot, "scripts", "detectar-solibri.ps1");
  if (!fs.existsSync(script)) return [];

  try {
    const output = execFileSync(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-Todos"],
      { encoding: "utf8", timeout: 20_000, stdio: ["ignore", "pipe", "ignore"] },
    );

    return output
      .split(/\r?\n/)
      .map((line) => line.split("|")[0]?.trim() ?? "")
      .filter((exe) => exe !== "" && fs.existsSync(exe));
  } catch {
    return [];
  }
}

/** Procura Solibri.exe ate dois niveis abaixo de cada pasta candidata. */
function searchWindows(): string[] {
  const found: string[] = [];

  const scan = (dir: string, depth: number): void => {
    if (depth > 2 || !fs.existsSync(dir)) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === "solibri.exe") {
        found.push(full);
      } else if (entry.isDirectory()) {
        scan(full, depth + 1);
      }
    }
  };

  for (const candidate of windowsRoots()) scan(candidate, 0);
  return found;
}

function searchMac(): string[] {
  const candidates = [
    "/Applications/Solibri.app/Contents/MacOS/Solibri",
    "/Applications/SOLIBRI/Solibri.app/Contents/MacOS/Solibri",
    "/Applications/Solibri Office.app/Contents/MacOS/Solibri",
  ];
  return candidates.filter((candidate) => fs.existsSync(candidate));
}

/** Todos os executaveis Solibri encontrados, do mais recente para o mais antigo. */
export function findSolibriExecutables(): string[] {
  if (process.platform === "darwin") return [...new Set(searchMac())];

  // O registro ja vem ordenado por versao; e a resposta preferida.
  const fromRegistry = searchRegistry();

  // A varredura complementa instalacoes que nao constam no registro. Sem versao
  // no caminho, a data de modificacao e o melhor criterio para preferir a mais nova.
  const fromDisk = [...new Set(searchWindows())].sort((a, b) => {
    try {
      return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
    } catch {
      return 0;
    }
  });

  return [...new Set([...fromRegistry, ...fromDisk])];
}

/** Primeiro executavel encontrado, ou undefined se o Solibri nao estiver instalado. */
export function detectSolibriExecutable(): string | undefined {
  return findSolibriExecutables()[0];
}
