import assert from "node:assert/strict";
import test from "node:test";
import { parseSpeakingTopics } from "./speaking-pdf.parser";

test("splits multiple Task 3 topics while retaining section order and French text", () => {
  const firstText = [
    "Sujet 1 : Tout le monde peut réduire ses déchets. Qu'en pensez-vous ?",
    "CLB 7",
    "À mon avis, il faut protéger l’environnement.",
    "CLB 5-6",
    "Je pense que chacun peut faire un effort.",
    "Plan du discours",
    "Introduction → arguments → conclusion",
    "Vocabulaire",
    "un déchet — waste",
    "Grammaire",
    "Il faut que nous réduisions nos déchets.",
  ].join("\n");
  const secondText = [
    "Sujet 2 : Les transports en commun sont-ils importants ?",
    "Réponse à vérifier",
    "Oui, les transports en commun facilitent la vie quotidienne.",
  ].join("\n");

  const result = parseSpeakingTopics(`${firstText}\n${secondText}`);

  assert.equal(result.topics.length, 2);
  assert.equal(result.topics[0].title, "Tout le monde peut réduire ses déchets. Qu'en pensez-vous ?");
  assert.equal(result.topics[0].sourceText, `${firstText}\n`);
  assert.deepEqual(result.topics[0].sections.map((section) => section.sectionType), [
    "UNCLASSIFIED",
    "CLB_7",
    "CLB_5_6",
    "SPEECH_PLAN",
    "VOCABULARY",
    "GRAMMAR",
  ]);
  assert.equal(result.topics[0].sections[1].content, "\nÀ mon avis, il faut protéger l’environnement.\n");
  assert.equal(result.topics[1].sourceText, secondText);
  assert.equal(result.topics[1].sections[0].sectionType, "UNCLASSIFIED");
  assert.match(result.topics[1].warnings.join(" "), /could not be classified/);
});

test("keeps all text in one review topic when boundaries are uncertain", () => {
  const text = "Contenu sans marqueur de sujet.\nTexte conservé intégralement.";
  const result = parseSpeakingTopics(text);

  assert.equal(result.topics.length, 1);
  assert.equal(result.topics[0].sourceText, text);
  assert.equal(result.topics[0].sections[0].content, text);
  assert.match(result.warnings.join(" "), /boundaries were not confidently detected/);
});

test("finds labelled and unlabelled prompts and preserves every source character", () => {
  const text = [
    "TOPIC 1",
    "Tout le monde peut réduire ses déchets. Qu'en pensez-vous ?",
    "Version CLB 7",
    "Réponse un.",
    "TOPIC 2",
    "Quel est votre avis sur les mesures prises ?",
    "Quels sont les actions importantes pour réduire la pollution",
    "Version CLB 7",
    "Réponse deux.",
    "Pour protéger la planète, les transports publics devraient être gratuits. Qu'en pensez-vous ?",
    "Version CLB 7",
    "Réponse trois.",
    "Pour protéger la planète, les transports publics devraient être gratuits. Qu'en pensez-vous ?",
    "Version CLB 7",
    "Réponse quatre, contenu distinct.",
  ].join("\n");

  const result = parseSpeakingTopics(text);

  assert.equal(result.topics.length, 4);
  assert.equal(result.topics[0].title, "Tout le monde peut réduire ses déchets. Qu'en pensez-vous ?");
  assert.equal(result.topics[1].title, "Quel est votre avis sur les mesures prises ?");
  assert.equal(result.topics[2].title, result.topics[3].title);
  assert.notEqual(result.topics[2].fingerprint, result.topics[3].fingerprint);
  assert.equal(result.topics.map((topic) => topic.sourceText).join(""), text);
});
