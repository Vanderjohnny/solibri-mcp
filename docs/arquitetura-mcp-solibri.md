# Como criar um MCP para conectar o Solibri a uma LLM

## Visão geral

Você não precisa modificar a LLM nem criar o MCP dentro do Solibri. O caminho recomendado é criar um **servidor MCP intermediário**, responsável por transformar as funções do Solibri em ferramentas que possam ser chamadas pela LLM.

```text
Usuário
   ↓
Seu chat ou agente
   ↓
LLM + MCP Client
   ↓
Servidor MCP do Solibri
   ↓
REST API / Autorun / Checking API / Java API
   ↓
Solibri
```

A LLM não acessa diretamente o Solibri. O seu aplicativo atua como **MCP Host**, conecta-se ao servidor MCP e disponibiliza ferramentas como:

```text
solibri_status
solibri_get_selection_basket
solibri_set_selection_basket
solibri_show_component_info
solibri_run_check
solibri_export_bcf
```

Quando necessário, a LLM escolhe uma dessas ferramentas e o seu aplicativo executa a chamada.

---

## 1. Qual interface do Solibri usar

### Opção A — REST API local do Solibri

É a melhor opção para começar.

Ela permite comunicação em tempo real entre um programa externo e o Solibri aberto no mesmo computador.

Exemplos de funções:

- Verificar se o Solibri está aberto.
- Consultar versão e estado atual.
- Ler e alterar a Selection Basket.
- Mostrar informações de um componente por GUID IFC.
- Ler ou controlar a câmera 3D.
- Abrir e salvar projetos.
- Trabalhar com conteúdo BCF.
- Atualizar arquivos IFC.

Documentação:

- https://solibri.github.io/Developer-Platform/latest/RestApiUsage.html

---

### Opção B — Solibri Autorun

É a melhor opção para executar processos completos e automáticos.

Exemplos:

- Abrir arquivos IFC.
- Carregar um conjunto de regras `.cset`.
- Carregar regras IDS.
- Executar checking.
- Criar issues automaticamente.
- Criar apresentações.
- Exportar BCF.
- Exportar relatórios Excel.
- Executar Information Takeoff.
- Salvar o projeto SMC.

O Autorun recebe um arquivo XML com uma sequência de tarefas.

Documentação:

- https://solibri.github.io/Developer-Platform/latest/autorun.html
- https://solibri.github.io/Developer-Platform/26.4.1/autorun-tasks.html

---

### Opção C — Solibri Checking API na nuvem

É indicada quando você quer executar verificações em servidor, sem depender do Solibri aberto na máquina do usuário.

A API pode trabalhar com:

- Arquivos IFC.
- Rulesets `.cset`.
- IDS.
- Classificações.
- Resultados JSON.
- Arquivos BCF.
- Arquivos SMC.

Documentação:

- https://checking-api-docs.solibri.com/

---

### Opção D — Solibri SMC Java API

Use quando a REST API não oferecer acesso suficiente.

A Java API permite criar:

- Regras personalizadas.
- Análises geométricas.
- Consultas de componentes.
- Resultados de verificação.
- Visualizações.
- Interfaces dentro do Solibri.
- Integrações com issues, ITO e câmera 3D.

Documentação:

- https://solibri.github.io/Developer-Platform/latest/getting-started.html
- https://solibri.github.io/Developer-Platform/latest/examples.html

---

## 2. Arquitetura recomendada

Para uma primeira versão, use esta combinação:

```text
REST API local          → comunicação em tempo real
Autorun                  → verificações e relatórios
Java API                 → funções profundas não expostas pela REST
MCP em TypeScript/Node   → ponte entre a LLM e o Solibri
```

---

## 3. Ativar a REST API do Solibri

No Windows, inicialize o Solibri por um atalho ou terminal com:

```bat
"C:\Program Files\Solibri\SOLIBRI\Solibri.exe" ^
  --rest-api-server-port=10876 ^
  --rest-api-server-http
```

A API ficará disponível em:

```text
http://127.0.0.1:10876/solibri/v1
```

Teste no PowerShell:

```powershell
Invoke-RestMethod "http://127.0.0.1:10876/solibri/v1/ping"
```

O retorno esperado é:

```text
pong
```

Também existe o argumento:

```bat
--rest-api-server-local-content
```

Ele permite expor caminhos locais completos, mas não é recomendado no início porque pode revelar informações internas do computador para a LLM.

---

## 4. Criar o projeto MCP

Requisitos:

- Node.js 20 ou superior.
- TypeScript.
- SDK MCP.
- Zod para validação dos parâmetros.

No terminal:

```bash
mkdir solibri-mcp
cd solibri-mcp

npm init -y
npm pkg set type=module

npm install @modelcontextprotocol/server zod tsx

mkdir src
```

Estrutura inicial:

```text
solibri-mcp/
├── src/
│   └── index.ts
├── package.json
└── .env
```

---

## 5. Código inicial do servidor MCP

Crie o arquivo:

```text
solibri-mcp/src/index.ts
```

Conteúdo:

```ts
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

const SOLIBRI_BASE_URL = (
  process.env.SOLIBRI_BASE_URL ??
  "http://127.0.0.1:10876/solibri/v1"
).replace(/\/+$/, "");

const noArguments = z.object({});

async function solibriRequest(
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const headers = new Headers(init.headers);

    if (!headers.has("accept")) {
      headers.set(
        "accept",
        "application/json, text/plain;q=0.9, */*;q=0.8",
      );
    }

    const response = await fetch(`${SOLIBRI_BASE_URL}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });

    const rawBody = await response.text();
    const contentType = response.headers.get("content-type") ?? "";

    let parsedBody: unknown;

    if (!rawBody) {
      parsedBody = { ok: true };
    } else if (contentType.includes("application/json")) {
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        parsedBody = rawBody;
      }
    } else {
      parsedBody = rawBody;
    }

    if (!response.ok) {
      const details =
        typeof parsedBody === "string"
          ? parsedBody
          : JSON.stringify(parsedBody);

      throw new Error(
        `Solibri respondeu HTTP ${response.status}: ${details}`,
      );
    }

    return parsedBody;
  } finally {
    clearTimeout(timeout);
  }
}

function successResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text:
          typeof data === "string"
            ? data
            : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function errorResult(error: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text:
          error instanceof Error
            ? error.message
            : String(error),
      },
    ],
    isError: true,
  };
}

async function safely(
  operation: () => Promise<unknown>,
) {
  try {
    return successResult(await operation());
  } catch (error) {
    return errorResult(error);
  }
}

function createServer() {
  const server = new McpServer({
    name: "solibri-local",
    version: "0.1.0",
  });

  server.registerTool(
    "solibri_ping",
    {
      description:
        "Verifica se a API local do Solibri está disponível.",
      inputSchema: noArguments,
    },
    async () =>
      safely(() => solibriRequest("/ping")),
  );

  server.registerTool(
    "solibri_about",
    {
      description:
        "Retorna a versão e a edição do Solibri em execução.",
      inputSchema: noArguments,
    },
    async () =>
      safely(() => solibriRequest("/about")),
  );

  server.registerTool(
    "solibri_status",
    {
      description:
        "Retorna o estado atual do Solibri e informa se existe um projeto aberto.",
      inputSchema: noArguments,
    },
    async () =>
      safely(() => solibriRequest("/status")),
  );

  server.registerTool(
    "solibri_get_selection_basket",
    {
      description:
        "Retorna os GUIDs IFC dos componentes atualmente presentes na Selection Basket.",
      inputSchema: noArguments,
    },
    async () =>
      safely(() => solibriRequest("/selectionBasket")),
  );

  server.registerTool(
    "solibri_set_selection_basket",
    {
      description:
        "Substitui a Selection Basket pela lista informada de GUIDs IFC.",
      inputSchema: z.object({
        guids: z
          .array(z.string().min(1))
          .min(1)
          .max(1000)
          .describe("Lista de GUIDs IFC dos componentes."),
      }),
    },
    async ({ guids }) =>
      safely(() =>
        solibriRequest("/selectionBasket", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(guids),
        }),
      ),
  );

  server.registerTool(
    "solibri_show_component_info",
    {
      description:
        "Seleciona um componente pelo GUID IFC e mostra suas informações no Solibri.",
      inputSchema: z.object({
        guid: z
          .string()
          .min(1)
          .describe("GUID IFC do componente."),
      }),
    },
    async ({ guid }) =>
      safely(() =>
        solibriRequest(
          `/info/${encodeURIComponent(guid)}`,
          {
            method: "POST",
          },
        ),
      ),
  );

  server.registerTool(
    "solibri_get_camera",
    {
      description:
        "Obtém a posição, direção e projeção da câmera 3D do Solibri.",
      inputSchema: noArguments,
    },
    async () =>
      safely(() => solibriRequest("/threed/camera")),
  );

  return server;
}

void serveStdio(createServer);

console.error(
  `Servidor MCP do Solibri ativo. Backend: ${SOLIBRI_BASE_URL}`,
);
```

### Observação importante sobre logs

Em um servidor MCP usando `stdio`, não use:

```ts
console.log("mensagem");
```

A saída padrão é reservada para o protocolo MCP.

Use:

```ts
console.error("mensagem de log");
```

---

## 6. Testar o servidor MCP

Com o Solibri aberto e a REST API ativa, execute:

```bash
npx @modelcontextprotocol/inspector npx tsx src/index.ts
```

No MCP Inspector:

1. Clique em **Connect**.
2. Abra a aba **Tools**.
3. Execute `solibri_ping`.
4. Execute `solibri_status`.
5. Abra um modelo IFC no Solibri.
6. Execute `solibri_get_selection_basket`.
7. Selecione um objeto no Solibri e teste novamente.

---

## 7. Configurar o MCP no seu aplicativo

Se o seu aplicativo já for compatível com MCP, a configuração normalmente terá uma estrutura parecida com esta:

```json
{
  "mcpServers": {
    "solibri": {
      "command": "npx",
      "args": [
        "tsx",
        "C:\\dev\\solibri-mcp\\src\\index.ts"
      ],
      "env": {
        "SOLIBRI_BASE_URL": "http://127.0.0.1:10876/solibri/v1"
      }
    }
  }
}
```

A localização exata desse JSON depende do MCP Host utilizado.

---

## 8. Criar o MCP Client no seu próprio agente

Instale o cliente MCP:

```bash
npm install @modelcontextprotocol/client
```

Exemplo básico:

```ts
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const client = new Client({
  name: "meu-agente-bim",
  version: "0.1.0",
});

const transport = new StdioClientTransport({
  command: "npx",
  args: [
    "tsx",
    "C:\\dev\\solibri-mcp\\src\\index.ts",
  ],
});

await client.connect(transport);

const { tools } = await client.listTools();

console.log(
  tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  })),
);

const result = await client.callTool({
  name: "solibri_status",
  arguments: {},
});

console.log(result);
```

Fluxo do agente:

```text
1. client.listTools()
2. Enviar nome, descrição e schema das ferramentas para a LLM
3. A LLM escolhe uma ferramenta
4. Executar client.callTool()
5. Enviar o resultado da ferramenta de volta para a LLM
6. A LLM gera a resposta final para o usuário
```

---

## 9. Exemplo de uso com a LLM

Comando do usuário:

```text
Selecione todas as paredes com problemas e mostre as informações do primeiro componente.
```

Fluxo esperado:

```text
LLM
 ↓
solibri_get_selection_basket
 ↓
Servidor MCP
 ↓
REST API do Solibri
 ↓
Retorno com GUIDs IFC
 ↓
solibri_show_component_info
 ↓
Solibri mostra o componente
```

Outro exemplo:

```text
Verifique se o Solibri está aberto e informe qual projeto está carregado.
```

Ferramenta chamada:

```text
solibri_status
```

---

## 10. Executar uma verificação real com Autorun

Para comandos como:

```text
Abra o IFC estrutural, execute o conjunto de regras de coordenação e gere um BCF.
```

O MCP pode receber:

```json
{
  "model": "C:\\BIM\\Modelos\\Estrutural.ifc",
  "ruleset": "C:\\BIM\\Regras\\Coordenacao.cset",
  "outputBcf": "C:\\BIM\\Saidas\\Coordenacao.bcf"
}
```

Depois, gerar internamente um arquivo XML:

```xml
<?xml version="1.0" encoding="ISO-8859-1"?>

<batch name="MCP quality check" default="run">
  <target name="run">

    <openmodel
      file="C:\BIM\Modelos\Estrutural.ifc" />

    <openruleset
      file="C:\BIM\Regras\Coordenacao.cset" />

    <check />

    <autocomment zoom="TRUE" />

    <createpresentation />

    <bcfreport
      file="C:\BIM\Saidas\Coordenacao.bcf"
      version="2.1" />

    <exit />

  </target>
</batch>
```

Executar o Solibri pelo Node.js:

```ts
import { spawn } from "node:child_process";

const solibriProcess = spawn(
  "C:\\Program Files\\Solibri\\SOLIBRI\\Solibri.exe",
  ["C:\\BIM\\Temp\\mcp-check.xml"],
  {
    shell: false,
    windowsHide: false,
  },
);

solibriProcess.on("exit", (code) => {
  console.error(`Solibri Autorun finalizado: ${code}`);
});
```

---

## 11. Trabalhar com processos demorados

Para verificações que podem levar vários minutos, use um sistema de jobs.

Ferramentas sugeridas:

```text
solibri_check_start
solibri_check_status
solibri_check_result
solibri_check_cancel
```

Fluxo:

```text
solibri_check_start
    ↓
Retorna jobId
    ↓
solibri_check_status
    ↓
Informa progresso
    ↓
solibri_check_result
    ↓
Retorna BCF, JSON ou relatório
```

Exemplo de resposta:

```json
{
  "jobId": "check-2026-001",
  "status": "running",
  "progress": 42
}
```

---

## 12. Quando usar a Java API

A REST API não oferece acesso completo a todas as informações internas do modelo.

Use a Java API para comandos como:

- Encontrar portas com largura menor que 80 cm.
- Calcular a distância entre hidrantes e saídas.
- Identificar componentes atravessando lajes.
- Criar regras próprias de acessibilidade.
- Analisar áreas e volumes.
- Criar verificações geométricas personalizadas.
- Criar visualizações específicas no Solibri.

Arquitetura recomendada:

```text
Servidor MCP em Node.js
      ↓ HTTP local
Plugin Java dentro do Solibri
      ↓
Solibri SMC API
```

O MCP continua simples e o plugin Java fica responsável pelas operações BIM mais profundas.

---

## 13. Alternativa usando servidor BCF

Para equipes, pode ser melhor conectar a LLM a um servidor BCF em vez de conectar diretamente à instalação local de cada usuário.

```text
LLM
 ↓
MCP do sistema BCF
 ↓
Servidor de issues BCF
 ↓
BCF Live Connector
 ↓
Solibri de cada integrante
```

Vantagens:

- Issues centralizadas.
- Comentários compartilhados.
- Responsáveis e prazos.
- Viewpoints sincronizados.
- Menor dependência de uma máquina específica.

Referência:

- https://help.solibri.com/hc/en-us/articles/1500005224401-About-BCF-Connector

---

## 14. Segurança indispensável

Não crie uma ferramenta genérica como:

```text
executar_comando_no_computador
```

Crie ferramentas específicas:

```text
solibri_status
solibri_select_components
solibri_show_component
solibri_run_approved_ruleset
solibri_export_bcf
```

Boas práticas:

- Restrinja modelos a uma pasta permitida.
- Restrinja rulesets a uma lista aprovada.
- Não aceite caminhos arbitrários de executáveis.
- Não use `shell: true`.
- Não exponha a REST API do Solibri para a internet.
- Use `stdio` quando tudo estiver na mesma máquina.
- Separe ferramentas de leitura das ferramentas de escrita.
- Exija confirmação para salvar, substituir ou excluir arquivos.
- Não envie IFC, BCF ou dados confidenciais para uma LLM externa sem autorização.
- Valide todos os GUIDs, nomes de arquivos e parâmetros.
- Registre logs das operações executadas.

Exemplo de pasta autorizada:

```text
C:\BIM\MCP_WORKSPACE
```

Exemplo de validação:

```ts
import path from "node:path";

const WORKSPACE = path.resolve("C:\\BIM\\MCP_WORKSPACE");

function validateWorkspacePath(filePath: string): string {
  const resolved = path.resolve(filePath);

  if (!resolved.startsWith(WORKSPACE + path.sep)) {
    throw new Error("O arquivo está fora da pasta autorizada.");
  }

  return resolved;
}
```

---

## 15. Estrutura recomendada do projeto

```text
solibri-mcp/
│
├── src/
│   ├── index.ts
│   ├── solibri-rest.ts
│   ├── solibri-autorun.ts
│   ├── checking-api.ts
│   ├── bcf-parser.ts
│   ├── path-security.ts
│   └── jobs.ts
│
├── workspace/
│   ├── models/
│   ├── rulesets/
│   ├── reports/
│   ├── bcf/
│   └── temp/
│
├── config/
│   └── approved-rulesets.json
│
├── package.json
├── tsconfig.json
└── .env
```

---

## 16. Ferramentas recomendadas para a primeira versão

Implemente nesta ordem:

```text
1. solibri_ping
2. solibri_about
3. solibri_status
4. solibri_get_selection_basket
5. solibri_set_selection_basket
6. solibri_show_component_info
7. solibri_get_camera
8. solibri_run_check
9. solibri_export_bcf
10. solibri_read_bcf
11. solibri_summarize_issues
```

---

## 17. Exemplo de catálogo de ferramentas MCP

```json
[
  {
    "name": "solibri_ping",
    "description": "Verifica se o Solibri está disponível.",
    "readOnly": true
  },
  {
    "name": "solibri_status",
    "description": "Retorna o estado atual do Solibri.",
    "readOnly": true
  },
  {
    "name": "solibri_get_selection_basket",
    "description": "Retorna os componentes selecionados.",
    "readOnly": true
  },
  {
    "name": "solibri_set_selection_basket",
    "description": "Altera os componentes selecionados.",
    "readOnly": false
  },
  {
    "name": "solibri_run_check",
    "description": "Executa um ruleset aprovado.",
    "readOnly": false
  },
  {
    "name": "solibri_export_bcf",
    "description": "Exporta as issues para um arquivo BCF.",
    "readOnly": false
  }
]
```

---

## 18. Exemplo de comando completo

Usuário:

```text
Verifique se o Solibri está aberto, execute a regra de coordenação e resuma as dez interferências mais graves.
```

Fluxo:

```text
1. LLM chama solibri_ping
2. LLM chama solibri_status
3. LLM chama solibri_run_check
4. O MCP inicia o Autorun
5. O MCP retorna um jobId
6. A LLM consulta solibri_check_status
7. O MCP exporta o resultado para BCF
8. O MCP lê o BCF
9. A LLM organiza as dez interferências mais graves
10. A resposta final é apresentada ao usuário
```

---

## 19. Resultado esperado

Com essa arquitetura, você pode chegar a comandos como:

```text
Verifique se o Solibri está aberto.
```

```text
Selecione os componentes com estes GUIDs.
```

```text
Mostre as propriedades deste componente.
```

```text
Execute o conjunto de regras de coordenação.
```

```text
Exporte as issues para BCF.
```

```text
Resuma os principais problemas encontrados no modelo.
```

```text
Liste as interferências por disciplina, andar e nível de gravidade.
```

Tudo isso sem fornecer controle irrestrito do computador para a LLM.

---

## 20. Próxima evolução recomendada

Depois da primeira versão, as evoluções mais úteis são:

1. Interface web para conversar com o modelo.
2. Integração com uma LLM local ou em nuvem.
3. Leitura automática de BCF.
4. Classificação de issues por gravidade.
5. Geração de relatórios em PDF ou Excel.
6. Integração com BIMcollab, BIM Track ou outro servidor BCF.
7. Plugin Java para regras personalizadas.
8. Histórico de verificações por projeto.
9. Controle de usuários e permissões.
10. Dashboard com quantidade de issues, disciplinas e status.

---

## Referências

- Solibri REST API: https://solibri.github.io/Developer-Platform/latest/RestApiUsage.html
- Solibri Autorun: https://solibri.github.io/Developer-Platform/latest/autorun.html
- Solibri Autorun Tasks: https://solibri.github.io/Developer-Platform/26.4.1/autorun-tasks.html
- Solibri Developer Platform: https://solibri.github.io/Developer-Platform/latest/getting-started.html
- Solibri Examples: https://solibri.github.io/Developer-Platform/latest/examples.html
- Solibri Checking API: https://checking-api-docs.solibri.com/
- Solibri BCF Connector: https://help.solibri.com/hc/en-us/articles/1500005224401-About-BCF-Connector
- Model Context Protocol: https://modelcontextprotocol.io/
- MCP TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
