# MCP Solibri

Servidor MCP que transforma o Solibri em ferramentas para uma LLM. Em vez de operar o
Solibri na mão, você pede em português: *"rode a regra de coordenação nesses dois
modelos e me diga as dez interferências mais graves"*.

```
LLM  →  MCP Client  →  MCP Solibri  →  REST API local / Autorun  →  Solibri
```

A LLM nunca fala com o Solibri diretamente e não tem acesso ao seu computador: ela só
consegue chamar as 25 ferramentas nomeadas deste servidor, todas restritas a uma pasta
de trabalho.

---

## Instalação

**Pré-requisitos:** [Node.js 20.18.1+](https://nodejs.org) (recomendado 22 LTS) e Solibri Office instalado.

```bash
git clone https://github.com/Vanderjohnny/solibri-mcp.git
cd solibri-mcp
npm install
```

O `npm install` já compila o projeto. Em seguida, registre o servidor no seu
aplicativo:

```bash
npm run register
```

Isso detecta o Claude Code e o Claude Desktop na máquina e registra o servidor nos dois
(fazendo backup da configuração existente antes de alterar). Se preferir escolher:

```bash
npm run register -- --code      # somente Claude Code
npm run register -- --desktop   # somente Claude Desktop
npm run register -- --print     # não altera nada, só mostra a configuração
```

No **Claude Desktop**, reinicie o aplicativo depois de registrar.

Para conferir se está tudo certo:

```bash
npm run doctor
```

```
[OK  ] Node.js 20 ou superior — versao 24.16.0
[OK  ] Dependencias instaladas
[OK  ] Build presente
[OK  ] Solibri instalado — C:\Program Files\Solibri\SOLIBRI\Solibri.exe
[OK  ] Workspace acessivel
[OK  ] REST API do Solibri respondendo
```

### Registro manual

Se preferir não usar o script:

**Claude Code**
```bash
claude mcp add solibri --scope user -- node "CAMINHO/DO/PROJETO/dist/index.js"
```

**Claude Desktop** — edite `claude_desktop_config.json`:
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "solibri": {
      "command": "node",
      "args": ["CAMINHO/DO/PROJETO/dist/index.js"]
    }
  }
}
```

O repositório também traz um `.mcp.json` que funciona automaticamente quando você abre
o Claude Code dentro da pasta do projeto.

---

## Ligar a REST API do Solibri

O Solibri **não** liga o servidor REST sozinho: ele depende de parâmetros de linha de
comando. No Windows, use o atalho incluído no projeto:

```
Iniciar Solibri com REST API.bat
```

Ele localiza o Solibri instalado sozinho. Para iniciar manualmente:

```bat
"C:\Program Files\Solibri\SOLIBRI\Solibri.exe" --rest-api-server-port=10876 --rest-api-server-http
```

Teste rápido:

```bash
curl http://127.0.0.1:10876/solibri/v1/ping
```

Sem `--rest-api-server-http`, o Solibri publica em **HTTPS** com certificado
autoassinado. Este servidor aceita esse certificado quando o host é local, mas o modo
HTTP é mais simples para uso na própria máquina.

Com o Solibri aberto, a documentação interativa da API fica em
`http://127.0.0.1:10876/solibri/v1/swagger-ui/index.html`.

---

## Como usar

Peça em linguagem natural. Alguns exemplos reais:

> O Solibri está aberto? Que projeto está carregado?

> Selecione os componentes com esses GUIDs e mostre as informações do primeiro.

> Rode o checking e exporte as issues para BCF.

> Leia o BCF da coordenação e liste as interferências por disciplina e gravidade.

### Dois modos de verificação

**`solibri_run_checking`** usa o Solibri já aberto, com os rulesets que você carregou
na interface. É rápido, interativo, e devolve os resultados na hora.

**`solibri_autorun_start`** abre uma instância do Solibri em modo Autorun a partir de
arquivos, sem interface. Exige que o Solibri esteja **fechado**, roda por minutos e
funciona como job assíncrono:

```
solibri_autorun_start({
  models: ["models/estrutural.ifc", "models/hidraulico.ifc"],
  rulesets: ["rulesets/coordenacao.cset"],
  bcfOutput: "bcf/coordenacao.bcf"
})
   ↓ jobId
solibri_autorun_status({ jobId: "check-0001" })
   ↓ succeeded
solibri_read_bcf({ file: "bcf/coordenacao.bcf", sortBySeverity: true, limit: 10 })
```

Os arquivos de entrada ficam em `workspace/models` e `workspace/rulesets`; as saídas em
`workspace/bcf` e `workspace/reports`.

---

## Ferramentas

25 ferramentas, separadas por tipo de efeito. As anotações MCP (`readOnlyHint`,
`destructiveHint`) permitem que o aplicativo peça confirmação apenas onde importa.

### Leitura

| Ferramenta | O que faz |
|---|---|
| `solibri_ping` | Confirma se a REST API responde. |
| `solibri_about` | Produto e versão do Solibri. |
| `solibri_status` | Se está ocupado, arquivo aberto, operação em curso. |
| `solibri_openapi_spec` | Baixa o OpenAPI da instância em execução. |
| `solibri_get_selection_basket` | GUIDs IFC na Selection Basket. |
| `solibri_get_camera` | Estado da câmera 3D. |
| `solibri_list_models` | Modelos abertos, com UUID interno e metadados. |
| `solibri_get_model_components` | GUIDs dos componentes de um modelo, paginado. |
| `solibri_get_model_metadata` | Metadado do modelo por chave. |
| `solibri_read_bcf` | Lê um BCF e resume as issues por status, prioridade, tipo e responsável. |
| `solibri_list_workspace` | Arquivos disponíveis na pasta autorizada. |
| `solibri_autorun_status` | Estado dos jobs de verificação em lote. |

### Escrita

| Ferramenta | O que faz |
|---|---|
| `solibri_set_selection_basket` | Substitui a seleção pelos GUIDs informados. |
| `solibri_show_component_info` | Seleciona um componente e abre as informações dele. |
| `solibri_set_camera` | Posiciona a câmera 3D. |
| `solibri_open_model` | Envia um IFC do workspace para o projeto aberto. |
| `solibri_update_model` | Substitui um modelo aberto por nova versão, total ou parcial. |
| `solibri_run_checking` | Roda o checking com os rulesets já carregados. |
| `solibri_export_bcf` | Exporta as issues para BCF dentro do workspace. |
| `solibri_create_presentation` | Cria apresentação de resultados. |
| `solibri_add_slide` | Adiciona uma issue à apresentação, destacando componentes. |
| `solibri_autorun_start` | Verificação em lote: abre IFCs, aplica rulesets, exporta BCF e relatório. |

### Destrutivas — confirme antes

| Ferramenta | O que faz |
|---|---|
| `solibri_save_project` | Salva o `.smc`, sobrescrevendo o destino. |
| `solibri_close_project` | Fecha o projeto; com `force`, descarta alterações. |
| `solibri_autorun_cancel` | Mata o processo do Solibri de um job em execução. |

O endpoint `POST /shutdown` da API **não** foi exposto como ferramenta: encerrar o
Solibri não é algo que a LLM deva poder fazer sozinha.

---

## Configuração

Tudo tem padrão razoável e o Solibri é detectado automaticamente. Só mexa aqui se
precisar. Copie `.env.example` para `.env` ou use o bloco `env` do aplicativo.

| Variável | Padrão | Função |
|---|---|---|
| `SOLIBRI_BASE_URL` | `http://127.0.0.1:10876/solibri/v1` | Base da REST API. |
| `SOLIBRI_TIMEOUT_MS` | `60000` | Timeout padrão das chamadas REST. |
| `SOLIBRI_EXE` | detectado automaticamente | Executável usado pelo Autorun. |
| `SOLIBRI_WORKSPACE` | `./workspace` | Única pasta em que o MCP lê e grava. |
| `SOLIBRI_STRICT_RULESETS` | `0` | `1` restringe rulesets aos listados em `config/approved-rulesets.json`. |

A detecção procura `Solibri.exe` em `Program Files\Solibri`, `Solibri Anywhere`,
`Solibri Office` e `Solibri Site`, até dois níveis de profundidade, e no macOS em
`/Applications`. Se você tem mais de uma versão instalada, `npm run doctor` mostra
todas e diz qual foi escolhida.

---

## Segurança

O projeto segue o princípio de não dar controle irrestrito da máquina à LLM.

- **Sem execução arbitrária.** Não existe ferramenta genérica de shell. O Autorun chama
  o executável do Solibri com `shell: false` e um único argumento: o XML gerado pelo
  próprio servidor.
- **Workspace fechado.** Toda leitura e escrita de arquivo passa por
  `resolveInWorkspace`, que rejeita saída da pasta autorizada por `..` e também segue
  symlinks para bloquear escapes indiretos.
- **Extensões validadas.** IFC só aceita `.ifc/.ifcxml/.ifczip`, ruleset só
  `.cset/.ids/.xml`, BCF só `.bcf/.bcfzip`, relatório só `.xlsx/.pdf/.rtf/.html`.
- **Entradas validadas.** GUID IFC precisa ter 22 caracteres do alfabeto do IFC; UUID
  de modelo segue o formato do Solibri. Valores inválidos falham antes da chamada HTTP.
- **XML escapado.** Nomes de arquivo são escapados antes de entrar no XML do Autorun.
- **Rulesets sob controle.** Com `SOLIBRI_STRICT_RULESETS=1`, apenas os rulesets
  listados em `config/approved-rulesets.json` podem ser executados.
- **TLS.** O certificado autoassinado do Solibri é aceito somente quando o host é
  `127.0.0.1`, `localhost` ou `::1`. Qualquer outro host mantém validação normal.
- **stdout é do protocolo.** Todo log vai para stderr; escrever em stdout corromperia a
  sessão MCP.

Não exponha a REST API do Solibri para fora da máquina, e não envie IFC ou BCF de
projeto para uma LLM externa sem autorização do cliente.

---

## Desenvolvimento

```bash
npm run typecheck   # verificação de tipos
npm run build       # compila para dist/
npm run dev         # roda direto do TypeScript
npm run smoke       # sobe o servidor, lista as 25 ferramentas, testa os bloqueios
npm run inspect     # abre o MCP Inspector para uso manual
npm run doctor      # diagnóstico da instalação
```

`scripts/make-test-bcf.mjs` gera um BCF sintético em `workspace/bcf/teste.bcf`, útil
para exercitar `solibri_read_bcf` sem rodar uma verificação real.

### Estrutura

```
src/
  index.ts      registro das 25 ferramentas MCP
  config.ts     variáveis de ambiente e pastas
  detect.ts     descoberta automática do Solibri instalado
  rest.ts       cliente da REST API, com suporte ao TLS local do Solibri
  autorun.ts    geração do XML de tarefas e disparo do Solibri em lote
  jobs.ts       controle dos jobs assíncronos
  bcf.ts        leitura e resumo de arquivos BCF
  security.ts   validação de caminhos, GUIDs e extensões
workspace/      única pasta acessível: models, rulesets, reports, bcf, temp
config/         approved-rulesets.json
scripts/        registro, diagnóstico, testes
docs/           material de referência sobre a arquitetura
```

---

## Sobre a API do Solibri

O contrato de endpoints usado aqui foi extraído das classes
`com.solibri.smc.api.rest.*` do `solibri.jar` de uma instalação local, e confere com a
documentação pública do Solibri Developer Platform. O base path `/solibri/v1` vem do
`application.properties` embutido no próprio Solibri.

Endpoints cobertos: `/ping`, `/about`, `/status`, `/selectionBasket`, `/info/{guid}`,
`/threed/camera`, `/models` e derivados, `/checking`, `/bcfxml/{version}`,
`/presentations`, `/slides`, `/project` e derivados.

Não cobertos nesta versão: `/information` e `/parametricInformation`, cujos nomes de
parâmetro não constam no bytecode. Com o Solibri aberto, `solibri_openapi_spec` devolve
a especificação completa e permite fechá-los.

## Próximos passos possíveis

1. Ferramentas para `/information` e `/parametricInformation`, após confirmar os
   parâmetros pelo OpenAPI.
2. Plugin Java com a SMC API para consultas geométricas que a REST não expõe (por
   exemplo, portas abaixo de uma largura mínima).
3. Conexão com servidor BCF (BIMcollab, BIM Track) em vez de arquivo local, para
   trabalho em equipe.
4. Cache de resultados de checking por projeto, com histórico entre execuções.

## Referências

- REST API: https://solibri.github.io/Developer-Platform/latest/RestApiUsage.html
- Autorun: https://solibri.github.io/Developer-Platform/latest/autorun.html
- Tarefas do Autorun: https://solibri.github.io/Developer-Platform/26.4.1/autorun-tasks.html
- Developer Platform: https://solibri.github.io/Developer-Platform/latest/getting-started.html
- Checking API na nuvem: https://checking-api-docs.solibri.com/
- Model Context Protocol: https://modelcontextprotocol.io/

## Licença

MIT. Solibri é marca registrada da Solibri Inc.; este projeto não tem vínculo com a
empresa.
