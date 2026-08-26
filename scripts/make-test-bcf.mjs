/** Gera um BCF 2.1 sintetico em workspace/bcf/teste.bcf para validar o parser. */
import AdmZip from "adm-zip";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "workspace", "bcf", "teste.bcf");
fs.mkdirSync(path.dirname(out), { recursive: true });

const zip = new AdmZip();
zip.addFile("bcf.version", Buffer.from(
  '<?xml version="1.0" encoding="UTF-8"?><Version VersionId="2.1"><DetailedVersion>2.1</DetailedVersion></Version>'));

const topics = [
  { guid: "aaaaaaaa-1111-1111-1111-111111111111", title: "Viga colide com duto de AVAC",
    type: "Clash", status: "Open", priority: "Critical", author: "solibri@unk.group",
    assigned: "estrutural@unk.group", desc: "Interferencia entre viga V12 e duto principal.",
    comps: ["1hjKl2mNo3PqRsTuVwXyZ$", "2AbCdEfGhIjKlMnOpQrStU"] },
  { guid: "bbbbbbbb-2222-2222-2222-222222222222", title: "Porta sem largura minima",
    type: "Issue", status: "Open", priority: "High", author: "solibri@unk.group",
    assigned: "arquitetura@unk.group", desc: "Porta P03 com 70 cm, abaixo da NBR 9050.",
    comps: ["3ZyXwVuTsRqPoNmLkJiHgF"] },
  { guid: "cccccccc-3333-3333-3333-333333333333", title: "Pilar sem material definido",
    type: "Info", status: "Closed", priority: "Low", author: "solibri@unk.group",
    assigned: "", desc: "Pilar P07 sem propriedade de material.", comps: [] },
];

for (const t of topics) {
  zip.addFile(`${t.guid}/markup.bcf`, Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<Markup>
  <Topic Guid="${t.guid}" TopicType="${t.type}" TopicStatus="${t.status}">
    <Title>${t.title}</Title>
    <Priority>${t.priority}</Priority>
    <CreationDate>2026-08-20T10:15:00Z</CreationDate>
    <CreationAuthor>${t.author}</CreationAuthor>
    <AssignedTo>${t.assigned}</AssignedTo>
    <Description>${t.desc}</Description>
    <Labels>Coordenacao</Labels>
  </Topic>
  <Comment Guid="c-${t.guid}">
    <Date>2026-08-21T09:00:00Z</Date>
    <Author>coordenacao@unk.group</Author>
    <Comment>Verificar com a disciplina responsavel.</Comment>
  </Comment>
</Markup>`, "utf8"));

  if (t.comps.length > 0) {
    const components = t.comps.map((g) => `<Component IfcGuid="${g}" />`).join("");
    zip.addFile(`${t.guid}/viewpoint.bcfv`, Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<VisualizationInfo Guid="v-${t.guid}">
  <Components><Selection>${components}</Selection></Components>
</VisualizationInfo>`, "utf8"));
  }
}

zip.writeZip(out);
console.log("BCF de teste gerado em", path.relative(root, out));
