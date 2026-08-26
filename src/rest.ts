import { Agent, fetch as undiciFetch, type Dispatcher } from "undici";
import { SOLIBRI_BASE_URL, REST_TIMEOUT_MS } from "./config.js";

/**
 * A REST API do Solibri roda por padrao em HTTPS com certificado autoassinado
 * (keystore/rest-api.p12 embutido no proprio Solibri). Aceitamos esse certificado
 * apenas quando o host e local; qualquer outro host mantem validacao normal.
 */
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function dispatcherFor(url: URL): Dispatcher | undefined {
  if (url.protocol !== "https:") return undefined;
  if (!LOCAL_HOSTS.has(url.hostname)) return undefined;
  return new Agent({ connect: { rejectUnauthorized: false } });
}

export interface RestResponse {
  status: number;
  contentType: string;
  /** Corpo ja interpretado: objeto (JSON), string (texto) ou Buffer (binario). */
  body: unknown;
}

export interface RestOptions {
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  json?: unknown;
  /** Corpo binario cru, usado para enviar IFC/SMC. */
  binary?: Uint8Array;
  /** Forca a leitura da resposta como binario (ex.: download de BCF). */
  expectBinary?: boolean;
  timeoutMs?: number;
}

function buildUrl(path: string, query?: RestOptions["query"]): URL {
  const url = new URL(SOLIBRI_BASE_URL + path);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url;
}

export async function solibriRequest(
  path: string,
  options: RestOptions = {},
): Promise<RestResponse> {
  const url = buildUrl(path, options.query);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? REST_TIMEOUT_MS);

  const headers: Record<string, string> = {
    accept: options.expectBinary
      ? "application/octet-stream, */*"
      : "application/json, text/plain;q=0.9, */*;q=0.8",
  };

  let body: string | Uint8Array | undefined;
  if (options.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(options.json);
  } else if (options.binary !== undefined) {
    headers["content-type"] = "application/octet-stream";
    body = options.binary;
  }

  try {
    const response = await undiciFetch(url, {
      method: options.method ?? "GET",
      headers,
      body: body as never,
      signal: controller.signal,
      dispatcher: dispatcherFor(url),
    });

    const contentType = response.headers.get("content-type") ?? "";
    let parsed: unknown;

    if (options.expectBinary) {
      parsed = Buffer.from(await response.arrayBuffer());
    } else {
      const raw = await response.text();
      if (raw === "") {
        parsed = { ok: response.ok };
      } else if (contentType.includes("application/json")) {
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = raw;
        }
      } else {
        parsed = raw;
      }
    }

    if (!response.ok) {
      const detail =
        parsed instanceof Buffer
          ? `${parsed.byteLength} bytes`
          : typeof parsed === "string"
            ? parsed.slice(0, 800)
            : JSON.stringify(parsed).slice(0, 800);
      throw new Error(`Solibri respondeu HTTP ${response.status} em ${path}: ${detail}`);
    }

    return { status: response.status, contentType, body: parsed };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `Tempo esgotado (${options.timeoutMs ?? REST_TIMEOUT_MS} ms) aguardando o Solibri em ${path}.`,
      );
    }
    if (error instanceof Error && /ECONNREFUSED|fetch failed|other side closed/i.test(error.message)) {
      throw new Error(
        `Nao foi possivel falar com a REST API do Solibri em ${SOLIBRI_BASE_URL}. ` +
          "Verifique se o Solibri esta aberto e foi iniciado com " +
          "--rest-api-server-port=10876 --rest-api-server-http.",
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/** Atalho para chamadas que retornam JSON/texto. */
export async function solibriData(path: string, options: RestOptions = {}): Promise<unknown> {
  return (await solibriRequest(path, options)).body;
}
