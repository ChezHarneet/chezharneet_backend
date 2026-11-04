import { createHash } from "node:crypto";
import pdfParse from "pdf-parse";

export type SpeakingSectionType =
  | "CLB_7"
  | "CLB_5_6"
  | "SPEECH_PLAN"
  | "VOCABULARY"
  | "GRAMMAR" 
  | "UNCLASSIFIED";

export type ExtractedSpeakingSection = {
  sectionType: SpeakingSectionType;
  heading: string;
  content: string;
  sortOrder: number;
};

export type ExtractedSpeakingTopic = {
  title: string;
  category: string;
  sourceText: string;
  sections: ExtractedSpeakingSection[];
  warnings: string[];
  fingerprint: string;
};

const sectionHeaders: Array<{ type: SpeakingSectionType; pattern: RegExp }> = [
  { type: "CLB_7", pattern: /\b(?:CLB|NCLC)\s*[-–]?\s*7\b|(?:complete|full)\s+(?:response|answer)|r[eé]ponse\s+compl[eè]te/i },
  { type: "CLB_5_6", pattern: /\b(?:CLB|NCLC)\s*[-–]?\s*5\s*[-–à]\s*6\b|(?:simplified|simple)\s+(?:response|answer)|r[eé]ponse\s+simplifi[eé]e/i },
  { type: "SPEECH_PLAN", pattern: /\bplan(?:\s+du\s+discours)?(?![\p{L}\p{N}_])|speech\s+plan|outline/iu },
  { type: "VOCABULARY", pattern: /\bvocabulaire\b|\bvocabulary\b/i },
  { type: "GRAMMAR", pattern: /\bgrammaire\b|\bgrammar(?:\s+notes?)?\b/i },
];

const explicitTopicHeading = /^\s*(?:(?:sujet|topic|th[eè]me)\s*(?:n[º°o]\s*)?\d{1,2}\s*[:.)\-–]\s*.+|(?:sujet|topic|th[eè]me)\s*(?:n[º°o]\s*)?\d{1,2}\s*)$/i;
const numberedTopicHeading = /^\s*(\d{1,2})\s*[.)\-–]\s*(.{15,240}\?)\s*$/;
const questionLikeTitle = /^\s*(?:[«“"]\s*)?(.{15,240}?\?)\s*(?:[»”"])?\s*$/;
const opinionPrompt = /qu['’]en pensez-vous|que pensez-vous|selon vous|à votre avis|etes-vous d['’]accord|êtes-vous d['’]accord|pensez-vous|faut-il|devrait-on|seriez-vous|souhaitez-vous|est-il important|est-ce\s+que|quelles?\s+|quels?\s+|les?\s+.+-(?:t-)?(?:il|elle|ils|elles)\b|ont-ils|ont-elles|sont-ils|sont-elles|peut-on|doit-on/i;

function headerType(line: string): SpeakingSectionType | null {
  const text = line.trim();
  if (!text || text.length > 120 || text.includes("\n")) return null;
  return sectionHeaders.find(({ pattern }) => pattern.test(text))?.type ?? null;
}

function explicitHeadingTitle(line: string) {
  return line
    .trim()
    .replace(/^(?:sujet|topic|th[eè]me)\s*(?:n[º°o]\s*)?\d{1,2}\s*[:.)\-–]?\s*/i, "")
    .replace(/^\d{1,2}\s*[.)\-–]\s*/, "")
    .trim();
}

function likelyTopicQuestion(line: string) {
  const text = line.trim();
  if (headerType(text)) return false;
  const match = text.match(questionLikeTitle);
  return Boolean(match && (opinionPrompt.test(match[1]) || /\b(?:est-ce|sont-ils|sont-elles|ont-ils|ont-elles|peut-il|peut-elle|peut-on|doit-on)\b/i.test(match[1])));
}

function isTopicBoundary(line: string) {
  const text = line.trim();
  const numbered = text.match(numberedTopicHeading);
  return explicitTopicHeading.test(text) || Boolean(numbered && opinionPrompt.test(numbered[2]));
}

function getTopicStarts(lines: string[]) {
  const starts: Array<{ index: number; explicit: boolean }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (isTopicBoundary(line)) {
      starts.push({ index, explicit: true });
    }
  }

  const questionStarts: Array<{ index: number; explicit: boolean }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!likelyTopicQuestion(lines[index])) continue;
    const nextContentLines = lines.slice(index + 1).filter((line) => line.trim()).slice(0, 5);
    if (nextContentLines.some((line) => headerType(line) === "CLB_7")) {
      const recentLines = lines.slice(Math.max(0, index - 10), index);
      let labelIndex = -1;
      recentLines.forEach((line, recentIndex) => {
        if (explicitTopicHeading.test(line.trim())) labelIndex = recentIndex;
      });
      const hasStartedVersion = labelIndex >= 0
        && recentLines.slice(labelIndex + 1).some((line) => headerType(line) === "CLB_7");
      if (labelIndex >= 0 && !hasStartedVersion) continue;
      questionStarts.push({ index, explicit: false });
    }
  }
  const combined = [...starts, ...questionStarts].sort((left, right) => left.index - right.index);
  return combined.filter((start, index) => index === 0 || combined[index - 1].index !== start.index);
}

function extractSections(sourceText: string): ExtractedSpeakingSection[] {
  const lines = sourceText.split(/(?<=\n)/);
  const boundaries: Array<{ offset: number; type: SpeakingSectionType; heading: string }> = [];
  let offset = 0;
  for (const line of lines) {
    const type = headerType(line);
    if (type) boundaries.push({ offset, type, heading: line.trim() });
    offset += line.length;
  }

  if (!boundaries.length) {
    return [{
      sectionType: "UNCLASSIFIED",
      heading: "Extracted content — review classification",
      content: sourceText,
      sortOrder: 0,
    }];
  }

  const sections: ExtractedSpeakingSection[] = [];
  if (boundaries[0].offset > 0) {
    sections.push({
      sectionType: "UNCLASSIFIED",
      heading: "Content before detected sections",
      content: sourceText.slice(0, boundaries[0].offset),
      sortOrder: sections.length,
    });
  }
  boundaries.forEach((boundary, index) => {
    const end = boundaries[index + 1]?.offset ?? sourceText.length;
    sections.push({
      sectionType: boundary.type,
      heading: boundary.heading,
      content: sourceText.slice(boundary.offset + (sourceText.slice(boundary.offset).split(/\r?\n/, 1)[0]?.length ?? 0), end),
      sortOrder: sections.length,
    });
  });
  return sections;
}

function topicTitle(sourceText: string, lines: string[], hasBoundary: boolean) {
  if (hasBoundary) {
    const heading = lines.find(isTopicBoundary);
    if (heading) {
      const title = explicitHeadingTitle(heading);
      if (title) return title;
    }
  }
  const firstQuestion = lines.find((line) => likelyTopicQuestion(line));
  if (firstQuestion) return firstQuestion.trim().replace(/^[«“"]|[»”"]$/g, "");
  const firstContentLine = lines.find((line) => line.trim().length > 0);
  return firstContentLine?.trim().slice(0, 180) || "Topic — title needs review";
}

function topicWarnings(sections: ExtractedSpeakingSection[]) {
  const types = new Set(sections.map((section) => section.sectionType));
  const warnings: string[] = [];
  if (!types.has("CLB_7")) warnings.push("CLB 7 response was not detected.");
  if (!types.has("CLB_5_6")) warnings.push("CLB 5–6 response was not detected.");
  if (!types.has("SPEECH_PLAN")) warnings.push("Speech plan was not detected.");
  if (!types.has("VOCABULARY")) warnings.push("Vocabulary section was not detected.");
  if (!types.has("GRAMMAR")) warnings.push("Grammar notes were not detected.");
  if (types.has("UNCLASSIFIED")) warnings.push("Some content could not be classified; it is retained for review.");
  return warnings;
}

function makeTopic(sourceText: string, boundaryLines: string[], hasBoundary: boolean): ExtractedSpeakingTopic {
  const sections = extractSections(sourceText);
  const title = topicTitle(sourceText, boundaryLines, hasBoundary);
  return {
    title,
    category: "",
    sourceText,
    sections,
    warnings: topicWarnings(sections),
    fingerprint: createHash("sha256").update(sourceText.normalize("NFC"), "utf8").digest("hex"),
  };
}

export function parseSpeakingTopics(extractedText: string): {
  topics: ExtractedSpeakingTopic[];
  warnings: string[];
} {
  if (!extractedText.trim()) {
    return {
      topics: [],
      warnings: ["No selectable text was found. This may be a scanned PDF; no OCR was run and no content was imported."],
    };
  }

  const lines = extractedText.split(/(?<=\n)/);
  const starts = getTopicStarts(lines);
  const offsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length;
  }

  if (!starts.length) {
    const topic = makeTopic(extractedText, lines, false);
    return {
      topics: [topic],
      warnings: ["Topic boundaries were not confidently detected. All text is retained in one review topic; add topics and move text manually before importing."],
    };
  }

  const topics = starts.map((start, index) => {
    const segmentStart = offsets[start.index] ?? 0;
    const segmentEnd = index + 1 < starts.length ? offsets[starts[index + 1].index] : extractedText.length;
    const sourceText = extractedText.slice(segmentStart, segmentEnd);
    return makeTopic(sourceText, sourceText.split(/(?<=\n)/), start.explicit);
  });
  const warnings = topics.length > 10
    ? [`${topics.length} topics were detected; the upload limit is 10. Remove or combine topics before importing.`]
    : [];
  return { topics, warnings };
}

export async function extractSpeakingTopicsFromPdf(buffer: Buffer) {
  const parsed = await pdfParse(buffer);
  return parseSpeakingTopics(parsed.text);
}
