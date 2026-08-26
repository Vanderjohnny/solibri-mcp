import fs from "node:fs";
import path from "node:path";

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
  const found = process.platform === "darwin" ? searchMac() : searchWindows();

  // Sem informacao de versao confiavel no caminho, a data de modificacao e o
  // melhor criterio disponivel para preferir a instalacao mais nova.
  return [...new Set(found)].sort((a, b) => {
    try {
      return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
    } catch {
      return 0;
    }
  });
}

/** Primeiro executavel encontrado, ou undefined se o Solibri nao estiver instalado. */
export function detectSolibriExecutable(): string | undefined {
  return findSolibriExecutables()[0];
}
