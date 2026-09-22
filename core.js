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
const APP_VERSION = "1.1.12";

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
