import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";

import { SOLIBRI_BASE_URL, WORKSPACE, ensureWorkspace } from "./config.js";
import { solibriData, solibriRequest } from "./rest.js";
import {
  assertIfcGuid,
  assertModelUuid,
  assertExtension,
  resolveExistingFile,
  resolveInWorkspace,
} from "./security.js";
import { startAutorun, cancelAutorun } from "./autorun.js";
import { describeJob, getJob, listJobs } from "./jobs.js";
import { readBcf, sortTopicsBySeverity } from "./bcf.js";

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function ok(data: unknown): ToolResult {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text", text }] };
}

function fail(error: unknown): ToolResult {
  return {
    content: [
      { type: "text", text: error instanceof Error ? error.message : String(error) },
    ],
    isError: true,
  };
}

async function run(operation: () => Promise<unknown> | unknown): Promise<ToolResult> {
  try {
    return ok(await operation());
  } catch (error) {
    return fail(error);
  }
}

const READ_ONLY = { readOnlyHint: true, openWorldHint: true } as const;
const WRITES = { readOnlyHint: false, destructiveHint: false, openWorldHint: true } as const;
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, openWorldHint: true } as const;

const server = new McpServer({ name: "solibri", version: "0.1.0" });

/* ---------------------- Estado e conexao ---------------------- */

server.registerTool(
  "solibri_ping",
  {
    title: "Verificar conexao",
    description:
      "Verifica se a REST API local do Solibri esta respondendo. Use antes das demais ferramentas quando nao souber se o Solibri esta aberto.",
    inputSchema: {},
    annotations: READ_ONLY,
  },
  async () => run(() => solibriData("/ping")),
);

server.registerTool(
  "solibri_about",
  {
    title: "Produto e versao",
    description: "Retorna o produto e a versao do Solibri em execucao.",
    inputSchema: {},
    annotations: READ_ONLY,
  },
  async () => run(() => solibriData("/about")),
);

server.registerTool(
  "solibri_status",
  {
    title: "Estado atual",
    description:
      "Retorna o estado do Solibri: se esta ocupado, qual arquivo esta aberto e o status da operacao em curso.",
    inputSchema: {},
    annotations: READ_ONLY,
  },
  async () => run(() => solibriData("/status")),
);

server.registerTool(
  "solibri_openapi_spec",
  {
    title: "Especificacao OpenAPI",
    description:
      "Baixa a especificacao OpenAPI da REST API do Solibri em execucao. Util para descobrir parametros exatos de endpoints menos usados.",
    inputSchema: {},
    annotations: READ_ONLY,
  },
  async () => run(() => solibriData("/v3/api-docs")),
);

/* ---------------------- Selecao e componentes ---------------------- */

server.registerTool(
  "solibri_get_selection_basket",
  {
    title: "Ler Selection Basket",
    description:
      "Retorna os GUIDs IFC dos componentes atualmente na Selection Basket do Solibri.",
    inputSchema: {},
    annotations: READ_ONLY,
  },
  async () => run(() => solibriData("/selectionBasket")),
);

server.registerTool(
  "solibri_set_selection_basket",
  {
    title: "Definir Selection Basket",
    description:
      "Substitui o conteudo da Selection Basket pelos GUIDs IFC informados. A selecao anterior e perdida.",
    inputSchema: {
      guids: z
        .array(z.string())
        .min(1)
        .max(5000)
        .describe("GUIDs IFC de 22 caracteres dos componentes a selecionar."),
    },
    annotations: WRITES,
  },
  async ({ guids }) =>
    run(() => {
      guids.forEach(assertIfcGuid);
      return solibriData("/selectionBasket", { method: "POST", json: guids });
    }),
);

server.registerTool(
  "solibri_show_component_info",
  {
    title: "Mostrar componente",
    description:
      "Seleciona um componente pelo GUID IFC e abre a janela de informacoes dele no Solibri.",
    inputSchema: {
      guid: z.string().describe("GUID IFC do componente, com 22 caracteres."),
    },
    annotations: WRITES,
  },
  async ({ guid }) =>
    run(() =>
      solibriData(`/info/${encodeURIComponent(assertIfcGuid(guid))}`, { method: "POST" }),
    ),
);

/* ---------------------- Camera 3D ---------------------- */

const vector3d = z.object({ x: z.number(), y: z.number(), z: z.number() });

server.registerTool(
  "solibri_get_camera",
  {
    title: "Ler camera 3D",
    description:
      "Retorna o estado da camera 3D: projecao, posicao, direcao, direcao para cima, campo de visao e escala.",
    inputSchema: {},
    annotations: READ_ONLY,
  },
  async () => run(() => solibriData("/threed/camera")),
);

server.registerTool(
  "solibri_set_camera",
  {
    title: "Posicionar camera 3D",
    description:
      "Define a camera 3D do Solibri. Chame antes solibri_get_camera para conhecer o estado atual e alterar somente o necessario.",
    inputSchema: {
      projection: z.enum(["PERSPECTIVE", "ORTHOGRAPHIC"]).describe("Tipo de projecao."),
      location: vector3d.describe("Posicao da camera."),
      direction: vector3d.describe("Direcao para onde a camera olha."),
      upDirection: vector3d.describe("Vetor que aponta para cima."),
      fieldOfView: z.number().optional().describe("Campo de visao, em graus."),
      viewToWorldScale: z
        .number()
        .optional()
        .describe("Escala de vista, usada na projecao ortografica."),
    },
    annotations: WRITES,
  },
  async (camera) => run(() => solibriData("/threed/camera", { method: "POST", json: camera })),
);

/* ---------------------- Modelos ---------------------- */

server.registerTool(
  "solibri_list_models",
  {
    title: "Listar modelos",
    description:
      "Lista os modelos abertos no projeto, com nome, UUID interno do Solibri e metadados.",
    inputSchema: {},
    annotations: READ_ONLY,
  },
  async () => run(() => solibriData("/models")),
);

server.registerTool(
  "solibri_get_model_components",
  {
    title: "Listar componentes do modelo",
    description:
      "Retorna os GUIDs IFC dos componentes de um modelo. Use limit e offset para paginar modelos grandes.",
    inputSchema: {
      modelUuid: z.string().describe("UUID interno do modelo, obtido em solibri_list_models."),
      limit: z.number().int().positive().max(50000).optional().describe("Tamanho da pagina."),
      offset: z.number().int().min(0).optional().describe("Elemento inicial da pagina."),
    },
    annotations: READ_ONLY,
  },
  async ({ modelUuid, limit, offset }) =>
    run(() =>
      solibriData(`/models/${encodeURIComponent(assertModelUuid(modelUuid))}/components`, {
        query: { limit, offset },
      }),
    ),
);

server.registerTool(
  "solibri_get_model_metadata",
  {
    title: "Ler metadado do modelo",
    description: "Le um metadado do modelo pela chave, por exemplo timestamp ou version.",
    inputSchema: {
      modelUuid: z.string().describe("UUID interno do modelo."),
      key: z.string().min(1).describe("Chave do metadado."),
    },
    annotations: READ_ONLY,
  },
  async ({ modelUuid, key }) =>
    run(() =>
      solibriData(
        `/models/${encodeURIComponent(assertModelUuid(modelUuid))}/metadata/${encodeURIComponent(key)}`,
      ),
    ),
);

server.registerTool(
  "solibri_open_model",
  {
    title: "Abrir modelo IFC",
    description:
      "Envia um arquivo IFC do workspace para o Solibri aberto e o adiciona ao projeto atual.",
    inputSchema: {
      file: z
        .string()
        .describe("Caminho do IFC relativo ao workspace, por exemplo models/estrutural.ifc."),
      name: z.string().min(1).optional().describe("Nome do modelo dentro do Solibri."),
    },
    annotations: WRITES,
  },
  async ({ file, name }) =>
    run(() => {
      const resolved = resolveExistingFile(file);
      assertExtension(resolved, [".ifc", ".ifcxml", ".ifczip"]);
      return solibriData("/models", {
        method: "POST",
        query: { name: name ?? path.basename(resolved) },
        binary: fs.readFileSync(resolved),
        timeoutMs: 600000,
      });
    }),
);

server.registerTool(
  "solibri_update_model",
  {
    title: "Atualizar modelo IFC",
    description:
      "Substitui um modelo ja aberto por uma nova versao do IFC. Use partial=true para atualizar somente os componentes presentes no arquivo.",
    inputSchema: {
      modelUuid: z.string().describe("UUID interno do modelo a atualizar."),
      file: z.string().describe("Caminho do IFC relativo ao workspace."),
      partial: z.boolean().optional().describe("Atualizacao parcial em vez de completa."),
    },
    annotations: WRITES,
  },
  async ({ modelUuid, file, partial }) =>
    run(() => {
      const uuid = assertModelUuid(modelUuid);
      const resolved = resolveExistingFile(file);
      assertExtension(resolved, [".ifc", ".ifcxml", ".ifczip"]);
      const endpoint = partial ? "partialUpdate" : "update";
      return solibriData(`/models/${encodeURIComponent(uuid)}/${endpoint}`, {
        method: "PUT",
        binary: fs.readFileSync(resolved),
        timeoutMs: 600000,
      });
    }),
);

/* ---------------------- Checking ao vivo ---------------------- */

server.registerTool(
  "solibri_run_checking",
  {
    title: "Rodar checking",
    description:
      "Executa o checking com os rulesets ja carregados no Solibri aberto e retorna os resultados. Para rodar um ruleset a partir de arquivos, use solibri_autorun_start.",
    inputSchema: {
      checkSelected: z
        .boolean()
        .optional()
        .describe("Verificar somente os componentes selecionados."),
    },
    annotations: WRITES,
  },
  async ({ checkSelected }) =>
    run(() =>
      solibriData("/checking", {
        method: "POST",
        query: { checkSelected },
        timeoutMs: 1800000,
      }),
    ),
);

/* ---------------------- BCF ---------------------- */

server.registerTool(
  "solibri_export_bcf",
  {
    title: "Exportar BCF",
    description: "Exporta as issues do Solibri aberto para um arquivo BCF dentro do workspace.",
    inputSchema: {
      output: z
        .string()
        .describe("Caminho de saida relativo ao workspace, por exemplo bcf/coordenacao.bcf."),
      version: z
        .enum(["one", "two", "two_one", "three"])
        .optional()
        .describe("Versao do BCF. Padrao two_one, que corresponde ao BCF 2.1."),
      scope: z
        .enum(["all", "selected", "marked"])
        .optional()
        .describe("Quais issues exportar. Padrao all."),
    },
    annotations: WRITES,
  },
  async ({ output, version, scope }) =>
    run(async () => {
      const resolved = resolveInWorkspace(output);
      assertExtension(resolved, [".bcf", ".bcfzip"]);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });

      const response = await solibriRequest(`/bcfxml/${version ?? "two_one"}`, {
        query: { scope: scope ?? "all" },
        expectBinary: true,
        timeoutMs: 600000,
      });

      const buffer = response.body as Buffer;
      fs.writeFileSync(resolved, buffer);
      return {
        savedTo: path.relative(WORKSPACE, resolved).split(path.sep).join("/"),
        bytes: buffer.byteLength,
      };
    }),
);

server.registerTool(
  "solibri_read_bcf",
  {
    title: "Ler BCF",
    description:
      "Le um arquivo BCF do workspace e devolve as issues estruturadas, com contagens por status, prioridade, tipo e responsavel.",
    inputSchema: {
      file: z.string().describe("Caminho do BCF relativo ao workspace."),
      limit: z
        .number()
        .int()
        .positive()
        .max(500)
        .optional()
        .describe("Numero maximo de issues detalhadas a retornar. Padrao 50."),
      sortBySeverity: z
        .boolean()
        .optional()
        .describe("Ordenar as issues das mais graves para as menos graves."),
      includeComments: z.boolean().optional().describe("Incluir os comentarios de cada issue."),
    },
    annotations: READ_ONLY,
  },
  async ({ file, limit, sortBySeverity, includeComments }) =>
    run(() => {
      const resolved = resolveExistingFile(file);
      assertExtension(resolved, [".bcf", ".bcfzip"]);

      const summary = readBcf(resolved);
      const ordered = sortBySeverity ? sortTopicsBySeverity(summary.topics) : summary.topics;
      const trimmed = ordered
        .slice(0, limit ?? 50)
        .map((topic) => (includeComments ? topic : { ...topic, comments: topic.comments.length }));

      return {
        ...summary,
        file: path.relative(WORKSPACE, resolved).split(path.sep).join("/"),
        returnedTopics: trimmed.length,
        topics: trimmed,
      };
    }),
);

/* ---------------------- Apresentacoes e slides ---------------------- */

server.registerTool(
  "solibri_create_presentation",
  {
    title: "Criar apresentacao",
    description:
      "Cria uma apresentacao de resultados no Solibri e retorna o id dela, usado por solibri_add_slide.",
    inputSchema: {
      name: z.string().min(1).describe("Nome da apresentacao."),
      prefix: z.string().optional().describe("Prefixo aplicado aos slides."),
    },
    annotations: WRITES,
  },
  async ({ name, prefix }) =>
    run(() => solibriData("/presentations", { method: "POST", json: { name, prefix } })),
);

server.registerTool(
  "solibri_add_slide",
  {
    title: "Adicionar slide",
    description:
      "Adiciona um slide, ou seja uma issue, a uma apresentacao existente, destacando componentes por GUID IFC.",
    inputSchema: {
      presentationId: z.string().min(1).describe("Id retornado por solibri_create_presentation."),
      title: z.string().min(1).describe("Titulo do slide."),
      description: z.string().optional().describe("Descricao da issue."),
      components: z
        .array(z.string())
        .max(5000)
        .optional()
        .describe("GUIDs IFC dos componentes destacados."),
      status: z.string().optional().describe("Status da issue."),
      priority: z.string().optional().describe("Prioridade da issue."),
      type: z.string().optional().describe("Tipo da issue."),
      stage: z.string().optional().describe("Fase do projeto."),
      duedate: z.string().optional().describe("Prazo, no formato ISO 8601."),
      responsibilities: z.array(z.string()).optional().describe("Responsaveis pela issue."),
      labels: z.array(z.string()).optional().describe("Etiquetas da issue."),
    },
    annotations: WRITES,
  },
  async (slide) =>
    run(() => {
      slide.components?.forEach(assertIfcGuid);
      return solibriData("/slides", { method: "POST", json: slide });
    }),
);

/* ---------------------- Projeto ---------------------- */

server.registerTool(
  "solibri_save_project",
  {
    title: "Salvar projeto",
    description:
      "Salva o projeto atual como arquivo .smc no workspace. Sobrescreve o destino caso ele ja exista, entao confirme com o usuario antes de usar.",
    inputSchema: {
      destination: z.string().describe("Caminho .smc de destino relativo ao workspace."),
    },
    annotations: DESTRUCTIVE,
  },
  async ({ destination }) =>
    run(() => {
      const resolved = resolveInWorkspace(destination);
      assertExtension(resolved, [".smc"]);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      return solibriData("/project/persist", {
        method: "POST",
        query: { destination: resolved },
        timeoutMs: 600000,
      });
    }),
);

server.registerTool(
  "solibri_close_project",
  {
    title: "Fechar projeto",
    description:
      "Fecha o projeto aberto no Solibri. Com force=true descarta alteracoes nao salvas, entao confirme com o usuario antes de usar.",
    inputSchema: {
      force: z.boolean().optional().describe("Descartar alteracoes nao salvas."),
    },
    annotations: DESTRUCTIVE,
  },
  async ({ force }) =>
    run(() => solibriData("/project/close", { method: "POST", query: { force } })),
);

/* ---------------------- Autorun em lote ---------------------- */

server.registerTool(
  "solibri_autorun_start",
  {
    title: "Iniciar verificacao em lote",
    description:
      "Abre o Solibri em modo Autorun para carregar IFCs, aplicar rulesets, rodar o checking e exportar BCF, relatorio e projeto. Retorna um jobId; acompanhe com solibri_autorun_status. Exige que o Solibri esteja fechado.",
    inputSchema: {
      models: z
        .array(z.string())
        .min(1)
        .describe("IFCs a abrir, em caminhos relativos ao workspace."),
      rulesets: z
        .array(z.string())
        .optional()
        .describe("Rulesets .cset ou regras .ids relativos ao workspace."),
      autocomment: z.boolean().optional().describe("Gerar comentarios automaticos. Padrao true."),
      createPresentation: z
        .boolean()
        .optional()
        .describe("Criar apresentacao de resultados. Padrao true."),
      bcfOutput: z.string().optional().describe("Saida do BCF relativa ao workspace."),
      bcfVersion: z.enum(["2.1", "3.0"]).optional().describe("Versao do BCF. Padrao 2.1."),
      reportOutput: z
        .string()
        .optional()
        .describe("Saida do relatorio .xlsx, .pdf, .rtf ou .html relativa ao workspace."),
      smcOutput: z.string().optional().describe("Saida do projeto .smc relativa ao workspace."),
    },
    annotations: WRITES,
  },
  async (request) => run(() => describeJob(startAutorun(request))),
);

server.registerTool(
  "solibri_autorun_status",
  {
    title: "Status da verificacao",
    description:
      "Consulta o estado de um job do Autorun. Sem jobId, lista todos os jobs desta sessao.",
    inputSchema: {
      jobId: z.string().optional().describe("Id do job retornado por solibri_autorun_start."),
    },
    annotations: READ_ONLY,
  },
  async ({ jobId }) =>
    run(() => (jobId ? describeJob(getJob(jobId)) : listJobs().map(describeJob))),
);

server.registerTool(
  "solibri_autorun_cancel",
  {
    title: "Cancelar verificacao",
    description: "Encerra o processo do Solibri de um job do Autorun ainda em execucao.",
    inputSchema: { jobId: z.string().describe("Id do job a cancelar.") },
    annotations: DESTRUCTIVE,
  },
  async ({ jobId }) =>
    run(() => {
      const job = getJob(jobId);
      cancelAutorun(job);
      return describeJob(job);
    }),
);

/* ---------------------- Workspace ---------------------- */

server.registerTool(
  "solibri_list_workspace",
  {
    title: "Listar workspace",
    description:
      "Lista os arquivos disponiveis na pasta autorizada do MCP, com modelos, rulesets, relatorios e BCFs.",
    inputSchema: {
      subfolder: z
        .string()
        .optional()
        .describe("Subpasta a listar, por exemplo models. Vazio lista tudo."),
    },
    annotations: READ_ONLY,
  },
  async ({ subfolder }) =>
    run(() => {
      const root = subfolder ? resolveInWorkspace(subfolder) : WORKSPACE;
      if (!fs.existsSync(root)) throw new Error(`Pasta inexistente: ${subfolder ?? "workspace"}`);

      const files: { path: string; bytes: number; modifiedAt: string }[] = [];

      const walk = (dir: string, depth: number): void => {
        if (depth > 4) return;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full, depth + 1);
          } else if (entry.isFile()) {
            const stat = fs.statSync(full);
            files.push({
              path: path.relative(WORKSPACE, full).split(path.sep).join("/"),
              bytes: stat.size,
              modifiedAt: stat.mtime.toISOString(),
            });
          }
        }
      };

      walk(root, 0);
      return { workspace: WORKSPACE, fileCount: files.length, files };
    }),
);

/* ---------------------- Inicializacao ---------------------- */

ensureWorkspace();

const transport = new StdioServerTransport();
await server.connect(transport);

// stdout pertence ao protocolo MCP; todo log vai para stderr.
console.error(`MCP Solibri ativo. REST: ${SOLIBRI_BASE_URL} | workspace: ${WORKSPACE}`);
