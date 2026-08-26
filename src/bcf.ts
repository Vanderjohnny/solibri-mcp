import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  parseAttributeValue: false,
  trimValues: true,
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "object" && "#text" in (value as Record<string, unknown>)) {
    const inner = (value as Record<string, unknown>)["#text"];
    return inner === undefined ? undefined : String(inner);
  }
  const str = String(value).trim();
  return str === "" ? undefined : str;
}

export interface BcfComment {
  author?: string;
  date?: string;
  text?: string;
}

export interface BcfTopic {
  guid?: string;
  title?: string;
  type?: string;
  status?: string;
  priority?: string;
  stage?: string;
  author?: string;
  createdAt?: string;
  assignedTo?: string;
  description?: string;
  labels: string[];
  comments: BcfComment[];
  /** GUIDs IFC dos componentes destacados nos viewpoints do topico. */
  componentGuids: string[];
}

export interface BcfSummary {
  file: string;
  version?: string;
  topicCount: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  byType: Record<string, number>;
  byAssignee: Record<string, number>;
  topics: BcfTopic[];
}

function tally(values: (string | undefined)[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const raw of values) {
    const key = raw && raw.trim() !== "" ? raw : "(nao definido)";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function componentGuidsFrom(xml: string): string[] {
  const parsed = parser.parse(xml) as Record<string, any>;
  const info = parsed?.VisualizationInfo;
  if (!info) return [];

  const guids = new Set<string>();
  const selection = asArray(info.Components?.Selection?.Component);
  const exceptions = asArray(info.Components?.Visibility?.Exceptions?.Component);

  for (const component of [...selection, ...exceptions]) {
    const guid = component?.["@IfcGuid"];
    if (typeof guid === "string" && guid !== "") guids.add(guid);
  }
  return [...guids];
}

/** Le um arquivo .bcf/.bcfzip e devolve um resumo estruturado das issues. */
export function readBcf(filePath: string): BcfSummary {
  const zip = new AdmZip(filePath);
  const entries = zip.getEntries();

  let version: string | undefined;
  const versionEntry = entries.find((e) => e.entryName.endsWith("bcf.version"));
  if (versionEntry) {
    const parsed = parser.parse(versionEntry.getData().toString("utf8")) as Record<string, any>;
    version = parsed?.Version?.["@VersionId"] ?? parsed?.Version?.DetailedVersion;
  }

  // Agrupa viewpoints por pasta de topico para associar componentes ao topico certo.
  const viewpointsByFolder = new Map<string, string[]>();
  for (const entry of entries) {
    if (!entry.entryName.toLowerCase().endsWith(".bcfv")) continue;
    const folder = entry.entryName.split("/").slice(0, -1).join("/");
    const guids = componentGuidsFrom(entry.getData().toString("utf8"));
    const current = viewpointsByFolder.get(folder) ?? [];
    viewpointsByFolder.set(folder, [...current, ...guids]);
  }

  const topics: BcfTopic[] = [];

  for (const entry of entries) {
    if (!entry.entryName.toLowerCase().endsWith("markup.bcf")) continue;

    const folder = entry.entryName.split("/").slice(0, -1).join("/");
    const parsed = parser.parse(entry.getData().toString("utf8")) as Record<string, any>;
    const markup = parsed?.Markup;
    const topic = markup?.Topic;
    if (!topic) continue;

    const comments = asArray(markup?.Comment).map((comment: any): BcfComment => ({
      author: text(comment?.Author),
      date: text(comment?.Date),
      text: text(comment?.Comment),
    }));

    topics.push({
      guid: topic["@Guid"],
      title: text(topic.Title),
      type: topic["@TopicType"],
      status: topic["@TopicStatus"],
      priority: text(topic.Priority),
      stage: text(topic.Stage),
      author: text(topic.CreationAuthor),
      createdAt: text(topic.CreationDate),
      assignedTo: text(topic.AssignedTo),
      description: text(topic.Description),
      labels: asArray(topic.Labels).map((l) => String(l)),
      comments,
      componentGuids: [...new Set(viewpointsByFolder.get(folder) ?? [])],
    });
  }

  return {
    file: filePath,
    version,
    topicCount: topics.length,
    byStatus: tally(topics.map((t) => t.status)),
    byPriority: tally(topics.map((t) => t.priority)),
    byType: tally(topics.map((t) => t.type)),
    byAssignee: tally(topics.map((t) => t.assignedTo)),
    topics,
  };
}

/** Ordem de gravidade usada para priorizar issues em resumos. */
const SEVERITY_ORDER = [
  "critical", "crítico", "critico", "high", "alta", "alto",
  "normal", "medium", "media", "média",
  "low", "baixa", "baixo", "info",
];

export function sortTopicsBySeverity(topics: BcfTopic[]): BcfTopic[] {
  const rank = (topic: BcfTopic): number => {
    const priority = (topic.priority ?? "").toLowerCase();
    const index = SEVERITY_ORDER.findIndex((s) => priority.includes(s));
    return index === -1 ? SEVERITY_ORDER.length : index;
  };
  return [...topics].sort((a, b) => rank(a) - rank(b));
}
