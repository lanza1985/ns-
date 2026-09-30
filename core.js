/*
 * NS# — Editor ejecutable de diagramas Nassi–Shneiderman
 * Autor: Luis Lanzafame
 * Copyright (c) 2026 Luis Lanzafame
 * Software libre bajo licencia MIT. Consultá el archivo LICENSE.
 */

// Estado compartido y utilidades, cargados antes que los demás scripts.

// Atajos para buscar elementos en la página.
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

// Incrementar este número en cada cambio y mantenerlo visible en la interfaz.
const APP_VERSION = "1.1.21";

// Convierte caracteres especiales a HTML seguro antes de mostrarlos.
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );

// Codifica texto UTF-8 en Base64 sin perder acentos ni eñes.
const utf8ToBase64 = (value) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary);
};

// Decodifica el Base64 utilizado dentro de los archivos .nsplus.
const base64ToUtf8 = (value) => {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

// NS Plus original invierte el Base64 antes de guardarlo.
const reverse = (value) => [...value].reverse().join("");

// Estado principal del editor. Todo lo que el usuario modifica vive aquí.
let nextId = 1,
  blocks = [],
  declarations = [],
  method = {
    className: "LaClase",
    modifiers: "public",
    returnType: "void",
    name: "main",
  },
  selectedId = null,
  runner = null,
  timer = null,
  pendingInput = null,
  autoSaveTimer = null,
  dragged = null;

// Un proyecto puede contener tantos diagramas como necesite. `blocks`,
// `declarations` y `method` siempre apuntan al diagrama que se está editando.
let diagrams = [], activeDiagramId = null, nextDiagramId = 1;
// Estas declaraciones pertenecen a la clase y no se duplican en cada método.
let classDeclarations = Object.create(null);
function normalizeClassDeclarations(value) {
  const result = Object.create(null);
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  Object.entries(value).forEach(([className, items]) => {
    if (!Array.isArray(items)) return;
    result[className] = items.filter((item) => item && typeof item.name === "string").map((item) => ({
      kind: ["variable", "declare", "constant"].includes(item.kind) ? item.kind : "variable",
      dataType: String(item.dataType ?? "Object"),
      name: item.name,
      expression: String(item.expression ?? ""),
    }));
  });
  return result;
}
function migrateGeneratedClassDeclarations() {
  // Los proyectos UML anteriores copiaban cada atributo a todos los métodos.
  // Se toma una copia por nombre y se quitan sólo las declaraciones generadas.
  diagrams.forEach((diagramItem) => {
    const className = String(diagramItem.method?.className ?? "").trim() || "Sin clase";
    const generated = diagramItem.declarations.filter((item) => item.umlGenerated && item.kind !== "parameter");
    if (!generated.length) return;
    const fields = classDeclarations[className] ||= [];
    generated.forEach((item) => {
      if (!fields.some((field) => field.name === item.name)) fields.push({ kind: item.kind, dataType: item.dataType, name: item.name, expression: item.expression || "" });
    });
    diagramItem.declarations = diagramItem.declarations.filter((item) => !generated.includes(item));
  });
  const active = diagrams.find((item) => item.id === activeDiagramId);
  if (active) declarations = active.declarations;
}
let umlState = { classes: [], relations: [], nextId: 1 };
let editorMode = "ns";
function normalizeUmlState(value) {
  // Al restaurar, se descartan relaciones huérfanas y se acota el lienzo.
  const classes = Array.isArray(value?.classes) ? value.classes.filter((item) => item && typeof item.id === "string").map((item) => ({
    id: item.id,
    name: String(item.name ?? "Clase"),
    attributes: String(item.attributes ?? ""),
    methods: String(item.methods ?? ""),
    x: Math.max(0, Math.min(1400, Number(item.x) || 0)),
    y: Math.max(0, Math.min(900, Number(item.y) || 0)),
    width: Math.max(170, Math.min(400, Number(item.width) || 220)),
  })) : [];
  const ids = new Set(classes.map((item) => item.id));
  const relations = Array.isArray(value?.relations) ? value.relations.filter((item) => item && typeof item.id === "string" && ids.has(item.from) && ids.has(item.to) && item.from !== item.to).map((item) => ({
    id: item.id,
    from: item.from,
    to: item.to,
    type: ["association", "inheritance", "implementation", "aggregation", "composition", "dependency"].includes(item.type) ? item.type : "association",
    label: String(item.label ?? ""),
  })) : [];
  return { classes, relations, nextId: Math.max(1, Number(value?.nextId) || 1) };
}
// Historial NSPlus decodificado; se conserva al importar y restaurar copias.
let projectMeta = [];

// Menú contextual para completar llamadas a diagramas del proyecto.
const callAutocomplete = document.createElement("div");
callAutocomplete.className = "call-autocomplete";
callAutocomplete.hidden = true;
document.body.append(callAutocomplete);
let callSuggestions = [], activeCallSuggestion = 0, autocompleteField = null;

// Algunos navegadores no permiten leer tipos personalizados de DataTransfer
// durante dragover. El estado en memoria es la fuente de verdad para los
// arrastres internos; los dos formatos sirven de respaldo al soltar.
const DRAG_TYPE = "application/x-ns-block";

// Clave única utilizada para no mezclar este proyecto con otros sitios.
const LOCAL_STORAGE_KEY = "nsplus-2-autosave";
const make = (type, data = {}) => ({ id: nextId++, type, ...data });

function setupAppVersion() {
  $("#appVersion").textContent = `v${APP_VERSION}`;
}

setupAppVersion();
