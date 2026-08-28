# Instruções para agentes (Claude Code, Claude Desktop)

Este projeto expõe o Solibri como ferramentas MCP. As regras abaixo existem para evitar
desperdício de tokens e resultados imprecisos.

---

## 1. Regra geral: dados, não pixels

**Use captura de tela o mínimo possível.** Sempre que existir uma via de dados — API,
MCP, arquivo, linha de comando — use ela em vez de olhar a tela.

Um screenshot custa de 1.500 a 2.500 tokens. Uma sessão feita por prints e cliques
consome dezenas de milhares. A mesma informação por API costuma custar de 50 a 200
tokens. E o custo é o menor dos problemas: um GUID, uma cota ou um nome de parâmetro
lido de imagem pode vir errado, e o erro se propaga em silêncio para o resto da tarefa.

Antes de capturar a tela, pergunte-se: *existe uma ferramenta que me dá esse dado como
texto?* Se existir, use-a.

| Em vez de | Prefira |
|---|---|
| Print da janela do Solibri | `mcp__solibri__*` (REST API) |
| Print da viewport do Revit | Ferramentas que retornam dados/elementos, não imagem |
| Print de página web | Leitura da árvore de acessibilidade / texto da página |
| Print de terminal ou log | Ler o arquivo de log direto |
| Print de planilha ou PDF | Ler o arquivo com a ferramenta do formato |

### Quando um print é legítimo

Capturar a tela é aceitável em três casos, e vale dizer ao usuário por que está fazendo:

1. O programa **não tem** via de dados para o que se precisa.
2. O usuário pediu explicitamente uma conferência **visual** (aparência, layout, render).
3. Diagnóstico de última instância, depois que a via de dados falhou e você já explicou
   ao usuário o que falhou.

Fora disso, não capture. E nunca entre em laço de *print → clique → print*: é o padrão
que mais queima tokens, e o mais frágil.

---

## 2. Solibri: use a API, nunca a tela

Para qualquer tarefa envolvendo o Solibri, use **exclusivamente** as ferramentas
`mcp__solibri__*`. Não opere a interface por mouse, teclado ou imagem.

### Se as ferramentas falharem

Quando `solibri_ping` responder que não conseguiu falar com a REST API, o problema é
**como o Solibri foi aberto**, não a ferramenta.

O Solibri só liga o servidor REST quando iniciado com parâmetros de linha de comando.
Aberto pelo ícone comum do Windows, a API não sobe.

Nesse caso, **peça ao usuário** para fechar o Solibri e reabrir pelo atalho:

```
Iniciar Solibri com REST API.bat
```

Não tente contornar a falha operando a interface gráfica. Prefira parar e pedir.

### Escolha da ferramenta certa

- Solibri **aberto**, rulesets já carregados na interface: `solibri_run_checking`.
- Solibri **fechado**, rodar a partir de arquivos: `solibri_autorun_start`, e acompanhe
  com `solibri_autorun_status` em vez de esperar em silêncio.
- Analisar resultados: `solibri_read_bcf` com `limit` e `sortBySeverity`. Não peça o BCF
  inteiro quando o usuário quer só as issues mais graves.
- Descobrir parâmetros de um endpoint pouco usado: `solibri_openapi_spec`.

---

## 3. Arquivos

Todo caminho é relativo à pasta `workspace/`. Não tente ler ou gravar fora dela: o
servidor bloqueia por segurança e a chamada vai falhar.

- `workspace/models/` — IFCs de entrada
- `workspace/rulesets/` — rulesets `.cset` e regras `.ids`
- `workspace/bcf/` e `workspace/reports/` — saídas

## 4. Operações que exigem confirmação

`solibri_save_project`, `solibri_close_project` e `solibri_autorun_cancel` são
destrutivas: sobrescrevem arquivo, descartam alterações não salvas ou matam um processo.
Confirme com o usuário antes de chamar.
