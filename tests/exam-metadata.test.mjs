import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const source = (file) => readFileSync(new URL(file, root), "utf8");
const startTime = "2026-09-22T18:00:00.000Z";
const b64 = (value) => Buffer.from(value, "utf8").toString("base64");

function harness(search = "", initialTime = startTime) {
  let clock = Date.parse(initialTime);
  class TestDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  }
  const context = vm.createContext({
    Date: TestDate, URLSearchParams, TextEncoder, TextDecoder, Uint8Array,
    atob, btoa, console,
    window: { location: { search } },
    document: {
      querySelector: () => ({ textContent: "" }),
      createElement: () => ({ style: {}, append() {} }),
      body: { append() {} },
    },
  });
  vm.runInContext(source("core.js"), context);
  vm.runInContext(source("exam-context.js"), context);
  vm.runInContext(`
    const projectName = { value: "MiPrograma" };
    const saveBtn = {}, openFile = {}, exportBtn = {};
    function allBlocks(items) { return items; }
    function render() {}
    function toast() {}
    diagrams = [{ id: "diagram-1", blocks: [], declarations: [], method }];
    activeDiagramId = "diagram-1";
  `, context);
  vm.runInContext(source("nsplus-format.js"), context);
  return {
    run: (code) => vm.runInContext(code, context),
    advance: (minutes) => { clock += minutes * 60000; },
  };
}

function examSearch(start, end, extra = "") {
  return `?k=${encodeURIComponent(b64(start))}&k2=${encodeURIComponent(b64(end))}${extra}`;
}

function unpack(file) {
  return JSON.parse(Buffer.from(file.data.split("").reverse().join(""), "base64").toString("utf8"));
}

test("URL sin parámetros", () => {
  const h = harness();
  assert.equal(h.run("getExamContext().enabled"), false);
  assert.equal(h.run("getExamContext().start"), null);
  assert.equal(h.run("getExamContext().user"), null);
});

test("URL con usuario, ID y curso", () => {
  const h = harness("?usuario=LANZAFAME%20LUIS%20ALBERTO&idusr=31525729&curso=FPR-2026-2");
  assert.equal(h.run("getExamContext().user"), "LANZAFAME LUIS ALBERTO");
  assert.equal(h.run("getExamContext().userId"), "31525729");
  assert.equal(h.run("getExamContext().course"), "FPR-2026-2");
});

test("examen activo dentro del rango, con límites inclusivos", () => {
  const h = harness(examSearch("2026-09-22T17:00:00Z", "2026-09-22T19:00:00Z"));
  assert.equal(h.run("getExamContext().enabled"), true);
  assert.equal(h.run('isExamActive(new Date("2026-09-22T17:00:00Z"))'), true);
  assert.equal(h.run('isExamActive(new Date("2026-09-22T19:00:00Z"))'), true);
});

test("el modo examen se evalúa otra vez al guardar", () => {
  const h = harness(examSearch("2026-09-22T18:10:00Z", "2026-09-22T19:00:00Z"));
  assert.equal(h.run("getExamContext().enabled"), false);
  h.advance(15);
  const project = unpack(h.run("createNsPlusFile()"));
  assert.equal(project.sem, b64("2026-09-22T18:10:00Z"));
});

test("fecha actual anterior al examen", () => {
  const h = harness(examSearch("2026-09-23T17:00:00Z", "2026-09-23T19:00:00Z"));
  assert.equal(h.run("getExamContext().enabled"), false);
  assert.equal(h.run("getExamContext().start.toISOString()"), "2026-09-23T17:00:00.000Z");
});

test("fecha actual posterior al examen", () => {
  const h = harness(examSearch("2026-09-21T17:00:00Z", "2026-09-21T19:00:00Z"));
  assert.equal(h.run("getExamContext().enabled"), false);
  assert.equal(h.run("getExamContext().end.toISOString()"), "2026-09-21T19:00:00.000Z");
});

test("URL del ejemplo conserva usuario y curso sin sem fuera del horario", () => {
  const search = "?k=TW9uIERlYyAxNSAyMDI1IDE4OjQ1OjAwIEdNVC0wMzAwIChBcmdlbnRpbmEgU3RhbmRhcmQgVGltZSk&k2=TW9uIERlYyAxNSAyMDI1IDIzOjAwOjAwIEdNVC0wMzAwIChBcmdlbnRpbmEgU3RhbmRhcmQgVGltZSk&curso=FPR-2026-2&usuario=LANZAFAME%20LUIS%20ALBERTO&idusr=31525729";
  const h = harness(search);
  const project = unpack(h.run("createNsPlusFile()"));
  assert.equal(h.run("getExamContext().start.toISOString()"), "2025-12-15T21:45:00.000Z");
  assert.equal(project.usr, "LANZAFAME LUIS ALBERTO");
  assert.equal(project.com, "FPR-2026-2");
  assert.equal("sem" in project, false);
});

test("Base64 inválido no rompe la carga", () => {
  const broken = harness("?k=%25%25%25");
  assert.equal(broken.run("getExamContext().start"), null);
  assert.equal(broken.run("getExamContext().enabled"), false);
});

test("fecha decodificada inválida no rompe la carga", () => {
  const broken = harness(`?k=${b64("fecha inválida")}&k2=${b64("otra fecha inválida")}`);
  assert.equal(broken.run("getExamContext().start"), null);
  assert.equal(broken.run("getExamContext().end"), null);
});

test("Save normal agrega metadata sin sem", () => {
  const h = harness();
  h.advance(35);
  const project = unpack(h.run("createNsPlusFile()"));
  assert.equal(project.usr, "Sin autor");
  assert.equal(project.uid, null);
  assert.equal(project.minutes, 35);
  assert.equal(project.date, "2026-09-22T18:35:00.000Z");
  assert.equal("sem" in project, false);
  assert.equal(project.editorState.version, 2);
});

test("Save durante examen usa k como sem en proyecto e historial", () => {
  const start = "2026-09-22T17:00:00Z";
  const h = harness(examSearch(start, "2026-09-22T19:00:00Z", "&curso=FPR-2026-2&usuario=Luis&idusr=31525729"));
  h.advance(35);
  const project = unpack(h.run("createNsPlusFile()"));
  const history = JSON.parse(Buffer.from(project.meta, "base64").toString("utf8"));
  assert.equal(project.sem, b64(start));
  assert.equal(project.uid, "31525729");
  assert.equal(history[0].i.sem, b64(start));
  assert.equal(history[0].i.start, startTime);
  assert.equal(history[0].i.minutes, 35);
});

test("preserva meta existente", () => {
  const h = harness();
  const previous = [{ d: "2025-01-01T00:00:00.000Z", i: { usr: "Anterior", com: "A", start: "2025-01-01T00:00:00.000Z", minutes: 2 } }];
  h.run(`projectMeta = ${JSON.stringify(previous)}`);
  const first = unpack(h.run("createNsPlusFile()"));
  const one = JSON.parse(Buffer.from(first.meta, "base64").toString("utf8"));
  assert.deepEqual(one[0], previous[0]);
  assert.equal(one.length, 2);
});

test("cada Save agrega una nueva entrada a meta", () => {
  const h = harness();
  const first = unpack(h.run("createNsPlusFile()"));
  const second = unpack(h.run("createNsPlusFile()"));
  const one = JSON.parse(Buffer.from(first.meta, "base64").toString("utf8"));
  const two = JSON.parse(Buffer.from(second.meta, "base64").toString("utf8"));
  assert.equal(one.length, 1);
  assert.equal(two.length, 2);
  assert.equal(two[1].i.start, startTime);
});

test("filename con curso e ID sanea caracteres inválidos", () => {
  const h = harness("?curso=FPR%2F2026&idusr=31%3A52");
  assert.equal(h.run('nsPlusFilename("Mi*Programa")'), "FPR_2026_31_52_Mi_Programa.nsplus");
  assert.equal(harness().run('nsPlusFilename("MiPrograma")'), "MiPrograma.nsplus");
});

test("abre y vuelve a guardar un .nsplus con metadata previa", () => {
  const h = harness("?usuario=Nuevo&curso=FPR&idusr=3");
  const original = unpack(h.run("createNsPlusFile()"));
  original.meta = b64(JSON.stringify([{ d: "2025-01-01T00:00:00.000Z", i: { usr: "Viejo", com: "C", start: "2025-01-01T00:00:00.000Z", minutes: 1, sem: "abc" } }]));
  const wrapped = { ver: 0.5, data: b64(JSON.stringify(original)).split("").reverse().join("") };
  h.run(`loadProjectFile(${JSON.stringify(wrapped)})`);
  const saved = unpack(h.run("createNsPlusFile()"));
  const history = JSON.parse(Buffer.from(saved.meta, "base64").toString("utf8"));
  assert.equal(history.length, 2);
  assert.equal(history[0].i.usr, "Viejo");
  assert.equal(history[0].i.sem, "abc");
  assert.equal(history[1].i.usr, "Nuevo");
  assert.equal(saved.editorState.diagrams.length, 1);
});
