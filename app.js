/*
 * NS# — Editor ejecutable de diagramas Nassi–Shneiderman
 * Autor: Luis Lanzafame
 * Copyright (c) 2026 Luis Lanzafame
 * Software libre bajo licencia MIT. Consultá el archivo LICENSE.
 */

// Atajos para buscar elementos en la página.
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

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
  autoSaveTimer = null;

// Clave única utilizada para no mezclar este proyecto con otros sitios.
const LOCAL_STORAGE_KEY = "nsplus-2-autosave";
const make = (type, data = {}) => ({ id: nextId++, type, ...data });

// Proyecto de ejemplo que aparece al abrir la aplicación.
const example = () => [
  make("output", { expression: '"¿Cuántos números?"' }),
  make("input", { name: "cantidad" }),
  make("for", {
    variable: "i",
    start: "1",
    end: "cantidad",
    step: "1",
    body: [
      make("output", { expression: '"Ingresá un número"' }),
      make("input", { name: "numero" }),
      make("instruction", { code: "suma = suma + numero" }),
    ],
  }),
  make("if", {
    condition: "cantidad > 0",
    then: [
      make("declare", { name: "promedio", expression: "suma / cantidad" }),
      make("output", { expression: '"Promedio: " + promedio' }),
    ],
    else: [make("output", { expression: '"No se ingresaron números"' })],
  }),
];
blocks = example();
declarations = [
  { kind: "declare", dataType: "Integer", name: "suma", expression: "0" },
];
selectedId = blocks[0].id;

// ---------- DIBUJO DEL DIAGRAMA ----------
const ed = (v, id, f) =>
  `<span class="editable" contenteditable="true" spellcheck="false" data-id="${id}" data-field="${f}">${esc(v)}</span>`;
const list = (a) => a.map(blockHTML).join("");

// Convierte un bloque de datos en el HTML visible del diagrama.
function blockHTML(b) {
  const c = `ns-block ${b.id === selectedId ? "selected " : ""}${runner?.current === b.id ? "active " : ""}${runner?.error === b.id ? "execution-error " : ""}`;
  if (b.type === "input")
    return `<div class="${c}" data-id="${b.id}"><div class="line"><b class="tag">E</b>${ed(b.name, b.id, "name")}</div></div>`;
  if (b.type === "output")
    return `<div class="${c}" data-id="${b.id}"><div class="line"><b class="tag">S</b>${ed(b.expression, b.id, "expression")}</div></div>`;
  if (b.type === "comment")
    return `<div class="${c}" data-id="${b.id}"><div class="line comment">/* ${ed(b.text, b.id, "text")} */</div></div>`;
  if (["instruction", "call"].includes(b.type))
    return `<div class="${c}" data-id="${b.id}"><div class="line">${ed(b.code, b.id, "code")}</div></div>`;
  if (["declare", "constant", "parameter", "variable"].includes(b.type)) {
    const label = {
      declare: "",
      constant: "const ",
      parameter: "parámetro ",
      variable: "variable ",
    }[b.type];
    return `<div class="${c}" data-id="${b.id}"><div class="line"><b class="tag">${label}</b>${ed(b.name, b.id, "name")}${b.type === "declare" || b.type === "constant" ? ` ← ${ed(b.expression, b.id, "expression")}` : ""}</div></div>`;
  }
  if (b.type === "return")
    return `<div class="${c}" data-id="${b.id}"><div class="line"><b>return</b>${ed(b.expression, b.id, "expression")}</div></div>`;
  if (b.type === "if")
    return `<div class="${c}" data-id="${b.id}"><div class="flow-marker flow-start">SI · INICIO</div><div class="condition">${ed(b.condition, b.id, "condition")}</div><div class="branches"><div class="branch"><div class="branch-label">V</div><div class="branch-body" data-container="${b.id}:then">${b.then.length ? list(b.then) : empty()}</div></div><div class="branch"><div class="branch-label">F</div><div class="branch-body" data-container="${b.id}:else">${b.else.length ? list(b.else) : empty()}</div></div></div><div class="flow-marker flow-end">FIN SI</div></div>`;
  if (b.type === "switch")
    return `<div class="${c}" data-id="${b.id}"><div class="flow-marker flow-start">SEGÚN · INICIO</div><div class="condition">según ${ed(b.expression, b.id, "expression")}</div>${b.cases.map((x, i) => `<div class="case-row"><div class="case-label">${ed(x.value, b.id, "case" + i)}</div><div class="case-body" data-container="${b.id}:case${i}">${x.body.length ? list(x.body) : empty()}</div></div>`).join("")}<div class="case-row"><div class="case-label">default</div><div class="case-body" data-container="${b.id}:default">${b.default.length ? list(b.default) : empty()}</div></div><div class="flow-marker flow-end">FIN SEGÚN</div></div>`;
  if (["while", "doWhile"].includes(b.type)) {
    const head = `<div class="condition">${ed(b.condition, b.id, "condition")}</div>`,
      body = `<div class="loop-body" data-container="${b.id}:body">${b.body.length ? list(b.body) : empty()}</div>`;
    const isWhile = b.type === "while";
    return `<div class="${c}" data-id="${b.id}">${isWhile ? `<div class="flow-marker flow-start">MIENTRAS · INICIO</div>${head}${body}<div class="flow-marker flow-end">FIN MIENTRAS</div>` : `<div class="flow-marker flow-start">REPETIR · INICIO</div>${body}<div class="flow-marker flow-end">HASTA QUE</div>${head}`}</div>`;
  }
  if (b.type === "for")
    return `<div class="${c}" data-id="${b.id}"><div class="flow-marker flow-start">PARA · INICIO</div><div class="condition">${ed(b.variable, b.id, "variable")} ← ${ed(b.start, b.id, "start")}, ${ed(b.end, b.id, "end")}, ${ed(b.step, b.id, "step")}</div><div class="loop-body" data-container="${b.id}:body">${b.body.length ? list(b.body) : empty()}</div><div class="flow-marker flow-end">FIN PARA</div></div>`;
  return `<div class="${c}" data-id="${b.id}"><div class="flow-marker flow-start">PARA CADA · INICIO</div><div class="condition">${ed(b.dataType, b.id, "dataType")} ${ed(b.variable, b.id, "variable")} : ${ed(b.collection, b.id, "collection")}</div><div class="loop-body" data-container="${b.id}:body">${b.body.length ? list(b.body) : empty()}</div><div class="flow-marker flow-end">FIN PARA CADA</div></div>`;
}
const empty = () =>
  '<div class="nested-empty">Seleccioná aquí para insertar</div>';
function render() {
  diagram.innerHTML = declarationHTML() + list(blocks);
  diagram.style.display = "block";
  emptyState.hidden = true;
  projectCardName.textContent = projectName.value || "Proyecto sin título";
  main.classList.toggle("no-colors", !colorToggle.checked);
  bind();
  renderVars();
}

// Dibuja la firma del método y sus declaraciones, separadas de las instrucciones.
function declarationHTML() {
  const field = (value, name) =>
    `<span class="editable declaration-field" contenteditable="true" spellcheck="false" data-method="${name}">${esc(value)}</span>`;
  const declarationField = (value, index, name) =>
    `<span class="editable declaration-field" contenteditable="true" spellcheck="false" data-declaration="${index}" data-declaration-field="${name}">${esc(value)}</span>`;
  const parameters = declarations
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.kind === "parameter")
    .map(
      ({ item, index }) =>
        `<span class="declaration-item parameter-item"><span class="declaration-drag">✥</span>${declarationField(item.dataType, index, "dataType")} ${declarationField(item.name, index, "name")}<button class="remove-declaration" data-remove-declaration="${index}" title="Eliminar">×</button></span>`,
    )
    .join(", ");
  const locals = declarations
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.kind !== "parameter")
    .map(({ item, index }) => {
      const initialized = ["constant", "declare"].includes(item.kind);
      return `<div class="declaration-item local-declaration"><span class="declaration-drag">✥</span>${item.kind === "constant" ? "final " : ""}${declarationField(item.dataType, index, "dataType")} ${declarationField(item.name, index, "name")}${initialized ? ` ← ${declarationField(item.expression, index, "expression")}` : ""}<button class="remove-declaration" data-remove-declaration="${index}" title="Eliminar">×</button></div>`;
    })
    .join("");
  return `<div class="method-header"><div class="class-signature">class ${field(method.className, "className")}:</div><div class="method-signature-ui">${field(method.modifiers, "modifiers")} ${field(method.returnType, "returnType")} ${field(method.name, "name")}(${parameters})</div></div><div class="declarations-area">${locals}</div>`;
}
// Recorre todos los bloques, incluso los que están dentro de if, switch y bucles.
function walk(items, callback, parent = null, key = null) {
  for (let index = 0; index < items.length; index++) {
    const block = items[index];
    if (callback(block, items, index, parent, key)) return true;

    for (const childKey of ["then", "else", "body", "default"]) {
      if (
        Array.isArray(block[childKey]) &&
        walk(block[childKey], callback, block, childKey)
      )
        return true;
    }

    if (block.cases) {
      for (let caseIndex = 0; caseIndex < block.cases.length; caseIndex++) {
        if (
          walk(block.cases[caseIndex].body, callback, block, `case${caseIndex}`)
        )
          return true;
      }
    }
  }
  return false;
}

// Busca un bloque solamente por su identificador.
function find(id) {
  let result;
  walk(blocks, (block) => {
    if (block.id !== id) return false;
    result = block;
    return true;
  });
  return result;
}

// Busca un bloque y también informa en qué Array y posición se encuentra.
function locate(id) {
  let result;
  walk(blocks, (block, container, index, parent, key) => {
    if (block.id !== id) return false;
    result = { b: block, a: container, i: index, p: parent, k: key };
    return true;
  });
  return result;
}
function bind() {
  // Los listeners se vuelven a conectar porque render() reemplaza el HTML.
  $$(".ns-block").forEach(
    (el) =>
      (el.onclick = (e) => {
        if (
          e.target.closest(".editable") ||
          e.target.closest("[data-container]")
        )
          return;
        e.stopPropagation();
        selectedId = +el.dataset.id;
        render();
      }),
  );
  $$(".editable").forEach((el) => {
    el.onclick = (e) => e.stopPropagation();
    el.onblur = () => {
      if (el.dataset.method) {
        method[el.dataset.method] = el.textContent.trim();
        render();
        return;
      }
      if (el.dataset.declaration) {
        declarations[+el.dataset.declaration][el.dataset.declarationField] =
          el.textContent.trim();
        render();
        return;
      }
      const b = find(+el.dataset.id),
        f = el.dataset.field;
      if (f.startsWith("case"))
        b.cases[+f.slice(4)].value = el.textContent.trim();
      else b[f] = el.textContent.trim();
      render();
    };
    el.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        el.blur();
      }
    };
  });
  $$("[data-remove-declaration]").forEach(
    (button) =>
      (button.onclick = (event) => {
        event.stopPropagation();
        declarations.splice(+button.dataset.removeDeclaration, 1);
        render();
      }),
  );
  $$("[data-container]").forEach(
    (el) =>
      (el.onclick = (e) => {
        if (e.target !== el && !e.target.classList.contains("nested-empty"))
          return;
        e.stopPropagation();
        selectedId = el.dataset.container;
        render();
      }),
  );
}
function fresh(t) {
  // Valores iniciales que recibe cada tipo de bloque nuevo.
  const d = {
    input: { name: "variable" },
    output: { expression: "expresión" },
    comment: { text: "comentario" },
    instruction: { code: "instrucción" },
    declare: { name: "variable", expression: "expresión" },
    parameter: { name: "parámetro" },
    constant: { name: "CONSTANTE", expression: "valor" },
    variable: { name: "variable" },
    if: { condition: "condición", then: [], else: [] },
    switch: {
      expression: "variable",
      cases: [
        { value: "valor1", body: [] },
        { value: "valor2", body: [] },
      ],
      default: [],
    },
    while: { condition: "condición", body: [] },
    doWhile: { condition: "condición", body: [] },
    for: { variable: "i", start: "0", end: "10", step: "1", body: [] },
    foreach: {
      dataType: "Tipo",
      variable: "elemento",
      collection: "colección",
      body: [],
    },
    call: { code: "funcion(params)" },
    return: { expression: "expresión" },
  }[t];
  return make(t, d);
}
function targetList() {
  // Determina si el usuario está agregando dentro de un if, caso o bucle.
  if (typeof selectedId === "string") {
    const [id, key] = selectedId.split(":"),
      b = find(+id);
    if (key.startsWith("case")) return b.cases[+key.slice(4)].body;
    return b[key];
  }
  return null;
}
function add(t) {
  // Las declaraciones viven arriba del método; los demás bloques viven en el flujo.
  const declarationKinds = {
    declParameter: "parameter",
    declConstant: "constant",
    declVariable: "variable",
    declInitialized: "declare",
  };
  if (declarationKinds[t]) {
    const kind = declarationKinds[t];
    declarations.push({
      kind,
      dataType: "Integer",
      name: kind === "constant" ? "CONSTANTE" : "variable",
      expression: kind === "constant" ? "valor" : "0",
    });
    render();
    return;
  }
  const b = fresh(t),
    target = targetList();
  if (target) target.push(b);
  else if (typeof selectedId === "number") {
    const l = locate(selectedId);
    l.a.splice(l.i + 1, 0, b);
  } else blocks.push(b);
  selectedId = b.id;
  render();
}
// ---------- CONTROLES DE LA INTERFAZ ----------
$$("[data-add]").forEach(
  (x) =>
    (x.onclick = (e) => {
      e.stopPropagation();
      add(x.dataset.add);
      typeDropdown.hidden = true;
    }),
);
$$(".acc-head").forEach(
  (h) =>
    (h.onclick = () => {
      h.classList.toggle("open");
      h.nextElementSibling.classList.toggle("open");
      h.lastElementChild.textContent = h.classList.contains("open") ? "⌃" : "⌄";
    }),
);
typeBtn.onclick = (e) => {
  e.stopPropagation();
  typeDropdown.hidden = !typeDropdown.hidden;
};
storageBtn.onclick = (e) => {
  e.stopPropagation();
  storageDropdown.hidden = !storageDropdown.hidden;
  typeDropdown.hidden = true;
};
storageDropdown.onclick = (e) => e.stopPropagation();
document.onclick = () => {
  typeDropdown.hidden = true;
  storageDropdown.hidden = true;
};
diagramsTab.onclick = () => diagramsPanel.classList.add("open");
blocksTab.onclick = () => blocksPanel.classList.add("open");
$$("[data-close]").forEach(
  (x) => (x.onclick = () => $("#" + x.dataset.close).classList.remove("open")),
);
runtimeClose.onclick = () => runtimePanel.classList.remove("open");
colorToggle.onchange = render;
darkToggle.checked = localStorage.getItem("ns-theme") === "dark";
document.body.classList.toggle("dark-theme", darkToggle.checked);
darkToggle.onchange = () => {
  document.body.classList.toggle("dark-theme", darkToggle.checked);
  localStorage.setItem("ns-theme", darkToggle.checked ? "dark" : "light");
  scheduleAutoSave();
};
const NEW_INTERFACE_KEY = "ns-interface";
const interfaceToggleEl = $("#interfaceToggle");
const dismissWelcomeBtn = $("#dismissWelcome");
const applyInterface = (isNew) => {
  document.body.classList.toggle("modern-ui", isNew);
  interfaceToggleEl.checked = isNew;
  localStorage.setItem(NEW_INTERFACE_KEY, isNew ? "modern" : "classic");
  scheduleAutoSave();
};
applyInterface(localStorage.getItem(NEW_INTERFACE_KEY) !== "classic");
interfaceToggleEl.onchange = () => applyInterface(interfaceToggleEl.checked);
dismissWelcomeBtn.onclick = () => {
  document.body.classList.add("welcome-dismissed");
  localStorage.setItem("ns-welcome-dismissed", "true");
};
if (localStorage.getItem("ns-welcome-dismissed") === "true")
  document.body.classList.add("welcome-dismissed");
projectName.oninput = render;
function mutateSelected(fn) {
  if (typeof selectedId !== "number") return;
  const l = locate(selectedId);
  if (l) fn(l);
}
deleteBtn.onclick = () =>
  mutateSelected((l) => {
    l.a.splice(l.i, 1);
    selectedId = null;
    render();
  });
moveUp.onclick = () =>
  mutateSelected((l) => {
    if (l.i) {
      [l.a[l.i - 1], l.a[l.i]] = [l.a[l.i], l.a[l.i - 1]];
      render();
    }
  });
moveDown.onclick = () =>
  mutateSelected((l) => {
    if (l.i < l.a.length - 1) {
      [l.a[l.i + 1], l.a[l.i]] = [l.a[l.i], l.a[l.i + 1]];
      render();
    }
  });
duplicateBtn.onclick = () =>
  mutateSelected((l) => {
    const clone = JSON.parse(JSON.stringify(l.b));
    walk([clone], (b) => {
      b.id = nextId++;
      return false;
    });
    l.a.splice(l.i + 1, 0, clone);
    selectedId = clone.id;
    render();
  });
newBtn.onclick = () => {
  stop();
  blocks = [];
  declarations = [];
  method = {
    className: "LaClase",
    modifiers: "public",
    returnType: "void",
    name: "main",
  };
  selectedId = null;
  projectName.value = "Proyecto sin título";
  render();
};
loadExample.onclick = () => {
  stop();
  blocks = example();
  declarations = [
    { kind: "declare", dataType: "Integer", name: "suma", expression: "0" },
  ];
  selectedId = blocks[0].id;
  projectName.value = "Promedio";
  diagramsPanel.classList.remove("open");
  render();
};

const inputHtml = (value) =>
  `<input class="input-for-statement" type="text" value="${esc(value)}" style="width: ${Math.max(3.5, String(value ?? "").length + 0.5)}ch;">`;

// ---------- COMPATIBILIDAD CON ARCHIVOS NS PLUS ----------
function nsPlusCode(source) {
  // NS Plus original guarda el diagrama como HTML. Aquí recreamos esa estructura.
  let serial = 0;
  const id = (name) => `xnsd-${name}-${serial++}`;
  const emptyOriginal = () =>
    `<div id="${id("empty")}" droppable="true" class="empty"></div>`;
  const statements = (items) =>
    items.length ? items.map(blockToNsPlus).join("") : emptyOriginal();

  function blockToNsPlus(block) {
    const own = (name) => id(name);
    const marker = ` data-nsr-type="${esc(block.type)}"`;
    if (block.type === "input")
      return `<div id="${own("input-statement")}" droppable="false" class="input-statement" type="input"${marker}><div id="${own("symbol")}" droppable="false" class="symbol">E</div><div id="${own("body")}" droppable="false" class="body">${inputHtml(block.name)}</div></div>`;
    if (block.type === "output")
      return `<div id="${own("output-statement")}" droppable="false" class="output-statement" type="output"${marker}><div id="${own("symbol")}" droppable="false" class="symbol">S</div><div id="${own("body")}" droppable="false" class="body">${inputHtml(block.expression)}</div></div>`;
    if (block.type === "comment")
      return `<div id="${own("comment-statement")}" droppable="false" class="comment-statement" type="comment"${marker}><div class="fixed-value-in-statement">/* </div>${inputHtml(block.text)}<div class="fixed-value-in-statement"> */</div></div>`;
    if (block.type === "instruction")
      return `<div id="${own("block-statement")}" droppable="false" class="block-statement" type="block"${marker}><div id="${own("content")}" droppable="false" class="content">${inputHtml(block.code)}</div></div>`;
    if (["declare", "constant", "parameter", "variable"].includes(block.type)) {
      const value = block.expression ?? "";
      return `<div id="${own("assignment-statement")}" droppable="false" class="assignment-statement" type="assignment"${marker}><input class="input-for-statement" type="text" value="${esc(block.name)}"><div class="fixed-value-in-statement"> <span class="arrow">←</span> </div>${inputHtml(value)}</div>`;
    }
    if (block.type === "call")
      return `<div id="${own("call-statement")}" droppable="false" class="call-statement" type="call"${marker}><div class="margin left">&nbsp;</div><div class="call">${inputHtml(block.code)}</div><div class="margin right">&nbsp;</div></div>`;
    if (block.type === "return")
      return `<div id="${own("return-statement")}" droppable="false" class="return-statement" type="return"${marker}><div class="fixed-value-in-statement">return </div>${inputHtml(block.expression)}</div>`;
    if (block.type === "if")
      return `<div id="${own("conditional-statement")}" droppable="false" class="conditional-statement conditional block-container" type="if"${marker}><div class="header"><div class="option true"><div class="option-block"><canvas class="corner corner-true"></canvas><div class="caption">V</div></div></div><div class="condition">${inputHtml(block.condition)}</div><div class="option false"><div class="option-block"><canvas class="corner corner-false"></canvas><div class="caption">F</div></div></div></div><div class="body"><div class="then">${statements(block.then)}</div><div class="else">${statements(block.else)}</div></div></div>`;
    if (block.type === "switch")
      return `<div id="${own("conditional-statement")}" droppable="false" class="conditional-statement switch block-container" type="switch"${marker}><div class="header"><div class="option true"><div class="option-block"><canvas class="corner corner-true"></canvas><div class="caption">&nbsp;</div></div></div><div class="condition">${inputHtml(block.expression)}</div><div class="option false"><div class="option-block"><canvas class="corner corner-false"></canvas><div class="caption">&nbsp;</div></div></div></div><div class="body">${block.cases.map((item) => `<div class="case"><div class="test-value">${inputHtml(item.value)}</div><div class="statements">${statements(item.body)}</div></div>`).join("")}<div class="case"><div class="test-value">${inputHtml("default")}</div><div class="statements">${statements(block.default)}</div></div></div></div>`;
    if (["while", "doWhile"].includes(block.type)) {
      const originalType = block.type === "doWhile" ? "dowhile" : "while";
      const condition = `<div class="condition-block"><div class="condition">${inputHtml(block.condition)}</div></div>`;
      const container = `<div class="container"><div class="side-${originalType}"></div><div class="statements">${statements(block.body)}</div></div>`;
      return `<div id="${own(`${originalType}-statement`)}" droppable="false" class="${originalType}-statement block-container" type="${originalType}"${marker}>${block.type === "while" ? condition + container : container + condition}</div>`;
    }
    if (["for", "foreach"].includes(block.type)) {
      const values =
        block.type === "for"
          ? `${inputHtml(block.variable)}<div class="fixed-value-in-statement"><span class="arrow">←</span></div>${inputHtml(block.start)}<div class="fixed-value-in-statement">,</div>${inputHtml(block.end)}<div class="fixed-value-in-statement">,</div>${inputHtml(block.step)}`
          : `${inputHtml(block.dataType)}${inputHtml(block.variable)}<div class="fixed-value-in-statement">:</div>${inputHtml(block.collection)}`;
      return `<div id="${own("for-statement")}" droppable="false" class="for-statement block-container" type="${block.type}"${marker}><div class="container"><div class="controller"><div class="top">&nbsp;</div><div class="content-block"><div class="content">${values}</div></div><div class="bottom">&nbsp;</div></div><div class="statements">${statements(block.body)}</div></div></div>`;
    }
    return "";
  }

  const declarationToNsPlus = (item) => {
    const type =
      item.kind === "constant" ? `final ${item.dataType}` : item.dataType;
    if (["constant", "declare"].includes(item.kind))
      return `<div id="${id("initialized-variable-declaration")}" droppable="false" class="initialized-variable-declaration" data-nsr-kind="${item.kind}"><div class="fixed-value-in-statement"></div><div class="type">${inputHtml(type)}</div><div class="assignment-statement">${inputHtml(item.name)}<div class="fixed-value-in-statement"> <span class="arrow">←</span> </div>${inputHtml(item.expression)}</div></div>`;
    const className =
      item.kind === "parameter"
        ? "parameter-declaration"
        : "variable-declaration";
    return `<div id="${id(className)}" droppable="false" class="${className}"><div class="fixed-value-in-statement"></div><div class="type">${inputHtml(item.dataType)}</div><div class="name">${inputHtml(item.name)}</div></div>`;
  };
  const parameters = declarations
    .filter((item) => item.kind === "parameter")
    .map(declarationToNsPlus)
    .join("");
  const locals = declarations
    .filter((item) => item.kind !== "parameter")
    .map(declarationToNsPlus)
    .join("");
  const declaration = `<div id="${id("method-declaration")}" droppable="false" class="method-declaration"><div class="class-declaration"><div class="fixed-value-in-statement">class</div><div class="class-name">${inputHtml(method.className)}</div><div class="fixed-value-in-statement">:</div></div><div class="method-signature"><div class="method-modifiers">${inputHtml(method.modifiers)}</div><div class="method-type">${inputHtml(method.returnType)}</div><div class="method-name">${inputHtml(method.name)}</div><div class="fixed-value-in-statement">(</div><div class="method-parameters">${parameters}</div><div class="fixed-value-in-statement">)</div></div></div>`;
  return `${declaration}<div class="local-variable-declaration">${locals}</div><div class="statements">${statements(source)}</div>`;
}

function createNsPlusFile() {
  // El archivo final respeta exactamente el contenedor .nsplus versión 0.5.
  const now = new Date().toISOString();
  const name = projectName.value || "Proyecto sin título";
  const audit = [
    {
      d: now,
      i: { usr: "Sin autor", com: "Sin comisión", start: now, minutes: 0 },
    },
  ];
  const project = {
    name,
    diagrams: [
      {
        id: "NSPDiagram-1",
        theClass: method.className,
        name: method.name,
        code: nsPlusCode(blocks),
      },
    ],
    usr: "Sin autor",
    uid: null,
    com: "Sin comisión",
    date: now,
    minutes: 0,
    meta: utf8ToBase64(JSON.stringify(audit)),
  };
  return { ver: 0.5, data: reverse(utf8ToBase64(JSON.stringify(project))) };
}

function parseNsPlusCode(code) {
  // Convierte el HTML interno de NS Plus nuevamente a nuestro modelo de bloques.
  const documentNode = new DOMParser().parseFromString(code, "text/html");
  const values = (element) =>
    [...element.querySelectorAll("input")].map((input) => input.value);
  const directBlocks = (element) =>
    [...element.children]
      .filter((child) => !child.classList.contains("empty"))
      .map(parseBlock)
      .filter(Boolean);

  function parseBlock(element) {
    const type = element.dataset.nsrType || element.getAttribute("type");
    const inputValues = values(element);
    if (type === "input")
      return make("input", {
        name: inputValues[0] || "variable",
      });
    if (type === "output")
      return make("output", { expression: inputValues[0] || "expresión" });
    if (type === "comment")
      return make("comment", { text: inputValues[0] || "comentario" });
    if (type === "block" || type === "instruction")
      return make("instruction", { code: inputValues[0] || "instrucción" });
    if (
      ["assignment", "declare", "constant", "parameter", "variable"].includes(
        type,
      )
    )
      return make(type === "assignment" ? "declare" : type, {
        name: inputValues[0] || "variable",
        expression: inputValues[1] || "",
      });
    if (type === "call") return make("call", { code: inputValues[0] || "" });
    if (type === "return")
      return make("return", { expression: inputValues[0] || "" });
    if (type === "if") {
      const body = element.querySelector(":scope > .body");
      return make("if", {
        condition:
          element.querySelector(":scope > .header .condition input")?.value ||
          "condición",
        then: directBlocks(body.querySelector(":scope > .then")),
        else: directBlocks(body.querySelector(":scope > .else")),
      });
    }
    if (type === "switch") {
      const cases = [...element.querySelectorAll(":scope > .body > .case")];
      const parsed = cases.map((item) => ({
        value: item.querySelector(":scope > .test-value input")?.value || "",
        body: directBlocks(item.querySelector(":scope > .statements")),
      }));
      const fallbackIndex = parsed.findIndex(
        (item) => item.value.toLowerCase() === "default",
      );
      const fallback =
        fallbackIndex >= 0 ? parsed.splice(fallbackIndex, 1)[0].body : [];
      return make("switch", {
        expression:
          element.querySelector(":scope > .header .condition input")?.value ||
          "variable",
        cases: parsed,
        default: fallback,
      });
    }
    if (type === "while" || type === "dowhile")
      return make(type === "dowhile" ? "doWhile" : "while", {
        condition:
          element.querySelector(":scope > .condition-block .condition input")
            ?.value || "condición",
        body: directBlocks(
          element.querySelector(":scope > .container > .statements"),
        ),
      });
    if (type === "for" || type === "foreach") {
      const ownInputs = [
        ...element.querySelectorAll(":scope > .container > .controller input"),
      ].map((input) => input.value);
      const body = directBlocks(
        element.querySelector(":scope > .container > .statements"),
      );
      return type === "for"
        ? make("for", {
            variable: ownInputs[0],
            start: ownInputs[1],
            end: ownInputs[2],
            step: ownInputs[3],
            body,
          })
        : make("foreach", {
            dataType: ownInputs[0],
            variable: ownInputs[1],
            collection: ownInputs[2],
            body,
          });
    }
    return null;
  }

  const root = [...documentNode.body.children].find((element) =>
    element.classList.contains("statements"),
  );
  const methodDeclaration = documentNode.querySelector(".method-declaration");
  const parsedMethod = {
    className:
      methodDeclaration?.querySelector(".class-name input")?.value || "LaClase",
    modifiers:
      methodDeclaration?.querySelector(".method-modifiers input")?.value ||
      "public",
    returnType:
      methodDeclaration?.querySelector(".method-type input")?.value || "void",
    name:
      methodDeclaration?.querySelector(".method-name input")?.value || "main",
  };
  const parseDeclaration = (element, fallbackKind) => {
    const declarationValues = values(element);
    const initialized = element.classList.contains(
      "initialized-variable-declaration",
    );
    const rawType = declarationValues[0] || "Integer";
    const constant = rawType.trim().startsWith("final ");
    return {
      kind:
        element.dataset.nsrKind ||
        (fallbackKind === "parameter"
          ? "parameter"
          : constant
            ? "constant"
            : initialized
              ? "declare"
              : "variable"),
      dataType: constant ? rawType.replace(/^final\s+/, "") : rawType,
      name: declarationValues[1] || "variable",
      expression: initialized ? declarationValues[2] || "" : "",
    };
  };
  const parameters = [
    ...(methodDeclaration?.querySelectorAll(
      ".method-parameters > .parameter-declaration",
    ) || []),
  ].map((element) => parseDeclaration(element, "parameter"));
  const locals = [
    ...documentNode.querySelectorAll(
      ".local-variable-declaration > .variable-declaration, .local-variable-declaration > .initialized-variable-declaration",
    ),
  ].map((element) => parseDeclaration(element, "local"));
  return {
    blocks: root ? directBlocks(root) : [],
    declarations: [...parameters, ...locals],
    method: parsedMethod,
  };
}

saveBtn.onclick = () => {
  const blob = new Blob([JSON.stringify(createNsPlusFile())], {
      type: "application/json",
    }),
    a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (projectName.value || "diagrama") + ".nsplus";
  a.click();
  URL.revokeObjectURL(a.href);
  toast("Proyecto guardado");
};
openFile.onchange = async (e) => {
  try {
    const d = JSON.parse(await e.target.files[0].text());
    if (d.ver === 0.5 && typeof d.data === "string") {
      const original = JSON.parse(base64ToUtf8(reverse(d.data)));
      const diagramData = original.diagrams?.[0];
      const parsedDiagram = parseNsPlusCode(diagramData?.code || "");
      blocks = parsedDiagram.blocks;
      declarations = parsedDiagram.declarations;
      method = parsedDiagram.method;
      projectName.value =
        original.name || diagramData?.name || "Proyecto importado";
    } else {
      blocks = d.blocks;
      declarations = d.declarations || [];
      method = d.method || method;
      projectName.value = d.name || "Proyecto importado";
    }
    if (!Array.isArray(blocks)) throw new Error("Estructura inválida");
    nextId = Math.max(0, ...all().map((b) => b.id)) + 1;
    selectedId = blocks[0]?.id || null;
    render();
    toast("Proyecto abierto");
  } catch {
    toast("Archivo no válido");
  }
};
exportBtn.onclick = () => window.print();
// Devuelve una lista plana para calcular IDs y números de línea.
const all = () => {
  const result = [];
  walk(blocks, (block) => {
    result.push(block);
    return false;
  });
  return result;
};

// ---------- MOTOR DE EJECUCIÓN ----------
function compile(source) {
  // Aplana selecciones y bucles en pasos sencillos que advance() puede ejecutar.
  const s = [];
  const add = (a) =>
    a.forEach((b) => {
      if (
        [
          "input",
          "output",
          "instruction",
          "declare",
          "constant",
          "parameter",
          "variable",
          "call",
          "return",
          "comment",
        ].includes(b.type)
      )
        s.push({ kind: b.type, b });
      else if (b.type === "if") {
        const q = { kind: "if", b, no: 0 };
        s.push(q);
        add(b.then);
        const j = { kind: "jump", to: 0 };
        s.push(j);
        q.no = s.length;
        add(b.else);
        j.to = s.length;
      } else if (b.type === "switch") {
        const q = { kind: "switch", b, map: {}, fallback: 0 };
        s.push(q);
        const ends = [];
        b.cases.forEach((c) => {
          q.map[c.value] = s.length;
          add(c.body);
          const j = { kind: "jump", to: 0 };
          s.push(j);
          ends.push(j);
        });
        q.fallback = s.length;
        add(b.default);
        ends.forEach((j) => (j.to = s.length));
      } else if (b.type === "while") {
        const start = s.length,
          q = { kind: "while", b, end: 0 };
        s.push(q);
        add(b.body);
        s.push({ kind: "jump", to: start });
        q.end = s.length;
      } else if (b.type === "doWhile") {
        const start = s.length;
        add(b.body);
        s.push({ kind: "doWhile", b, to: start });
      } else if (b.type === "for") {
        const start = s.length,
          q = { kind: "forInit", b, end: 0 };
        s.push(q);
        add(b.body);
        const n = { kind: "forNext", b, to: start + 1, end: 0 };
        s.push(n);
        q.end = n.end = s.length;
      } else if (b.type === "foreach") {
        const start = s.length,
          q = { kind: "eachInit", b, end: 0 };
        s.push(q);
        add(b.body);
        const n = { kind: "eachNext", b, to: start + 1, end: 0 };
        s.push(n);
        q.end = n.end = s.length;
      }
    });
  add(source);
  return s;
}
function expr(x) {
  // Evalúa una expresión usando solamente las variables creadas por el programa.
  const n = Object.keys(runner.vars),
    v = Object.values(runner.vars);
  return Function(...n, `"use strict";return (${x})`)(...v);
}
function condition(x) {
  if (/\b[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*\s*=(?!=)/.test(x))
    throw Error('Usá "==" para comparar valores; "=" no es válido en una condición');
  return expr(x);
}
function assign(code) {
  const m = code.match(/^\s*([A-Za-z_$][\w$]*)\s*(?:=|←)\s*(.+)$/);
  if (!m)
    throw Error("Se esperaba una asignación, por ejemplo: total = total + 1");
  runner.vars[m[1]] = expr(m[2]);
}
function out(v, cls = "") {
  const d = document.createElement("div");
  d.textContent = String(v);
  d.className = cls;
  console.append(d);
  console.scrollTop = console.scrollHeight;
}
function state(x) {
  status.textContent = x;
  status.className =
    "status " +
    ({
      Listo: "ready",
      Ejecutando: "running",
      Pausado: "paused",
      Error: "error",
    }[x] || "ready");
  pauseBtn.disabled = x !== "Ejecutando";
}
async function advance() {
  // Ejecuta un único paso y luego agenda el siguiente si el modo automático sigue activo.
  if (!runner || runner.done) return;
  if (runner.pc >= runner.steps.length) return finish();
  const x = runner.steps[runner.pc];
  runner.current = x.b?.id;
  render();
  const b = x.b;
  try {
    if (["comment", "variable"].includes(x.kind)) runner.pc++;
    else if (x.kind === "instruction") {
      assign(b.code);
      runner.pc++;
    } else if (["declare", "constant"].includes(x.kind)) {
      runner.vars[b.name] = expr(b.expression);
      runner.pc++;
    } else if (["input", "parameter"].includes(x.kind)) {
      const val = await ask(b);
      if (val === Symbol.for("cancel")) return stop();
      runner.vars[b.name] = parse(val);
      runner.pc++;
    } else if (x.kind === "output") {
      out(expr(b.expression));
      runner.pc++;
    } else if (x.kind === "call") {
      expr(b.code);
      runner.pc++;
    } else if (x.kind === "return") {
      runner.returnValue = expr(b.expression);
      out("return: " + runner.returnValue);
      runner.pc = runner.steps.length;
    } else if (x.kind === "if")
      runner.pc = condition(b.condition) ? runner.pc + 1 : x.no;
    else if (x.kind === "switch") {
      const val = String(expr(b.expression));
      runner.pc = x.map[val] ?? x.fallback;
    } else if (x.kind === "while")
      runner.pc = expr(b.condition) ? runner.pc + 1 : x.end;
    else if (x.kind === "doWhile")
      runner.pc = expr(b.condition) ? x.to : runner.pc + 1;
    else if (x.kind === "jump") runner.pc = x.to;
    else if (x.kind === "forInit") {
      const step = Number(expr(b.step));
      runner.loops[b.id] = { end: Number(expr(b.end)), step };
      runner.vars[b.variable] = Number(expr(b.start));
      runner.pc = ok(runner.vars[b.variable], runner.loops[b.id])
        ? runner.pc + 1
        : x.end;
    } else if (x.kind === "forNext") {
      const f = runner.loops[b.id];
      runner.vars[b.variable] += f.step;
      runner.pc = ok(runner.vars[b.variable], f) ? x.to : x.end;
    } else if (x.kind === "eachInit") {
      const values = expr(b.collection);
      if (!values?.[Symbol.iterator])
        throw Error("La colección no es iterable");
      runner.loops[b.id] = { values: [...values], i: 0 };
      if (!runner.loops[b.id].values.length) runner.pc = x.end;
      else {
        runner.vars[b.variable] = runner.loops[b.id].values[0];
        runner.pc++;
      }
    } else if (x.kind === "eachNext") {
      const f = runner.loops[b.id];
      f.i++;
      if (f.i < f.values.length) {
        runner.vars[b.variable] = f.values[f.i];
        runner.pc = x.to;
      } else runner.pc = x.end;
    }
    renderVars();
    if (runner.auto) timer = setTimeout(advance, +speed.value);
  } catch (e) {
    const lineIndex = b ? all().findIndex((block) => block.id === b.id) : -1;
    runner.error = b?.id ?? null;
    out(
      `${lineIndex >= 0 ? `Error en línea ${lineIndex + 1}: ` : "Error: "}${e.message}`,
      "error",
    );
    runner.done = true;
    runner.current = null;
    state("Error");
    render();
  }
}
const ok = (v, f) => (f.step >= 0 ? v <= f.end : v >= f.end);
const parse = (v) => {
  v = v.trim();
  if (v === "true") return true;
  if (v === "false") return false;
  if (v !== "" && !isNaN(Number(v))) return Number(v);
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
};
function start(auto) {
  runtimePanel.classList.add("open");
  blocksPanel.classList.remove("open");
  if (!runner || runner.done) {
    const declaredVariables = declarations
      .filter((item) => item.kind !== "parameter")
      .map((item, index) => ({
        id: `declaration-${index}`,
        type: item.kind,
        name: item.name,
        expression: item.expression,
      }));
    runner = {
      steps: compile([...declaredVariables, ...blocks]),
      pc: 0,
      vars: {},
      loops: {},
      done: false,
      auto,
      current: null,
    };
  }
  runner.auto = auto;
  state(auto ? "Ejecutando" : "Pausado");
  advance();
}
function finish() {
  runner.done = true;
  runner.current = null;
  state("Listo");
  out("✓ Programa finalizado");
  render();
}
function stop() {
  clearTimeout(timer);
  timer = null;
  if (pendingInput) {
    pendingInput(Symbol.for("cancel"));
    pendingInput = null;
  }
  if (inputDialog.open) inputDialog.close();
  runner = null;
  state("Listo");
  renderVars();
  render();
}
function ask(b) {
  inputTitle.textContent = "Ingrese valor para variable: " + b.name;
  inputLabel.textContent = "";
  runtimeInput.value = "";
  inputDialog.showModal();
  setTimeout(() => runtimeInput.focus(), 20);
  return new Promise((r) => (pendingInput = r));
}
inputForm.onsubmit = (e) => {
  e.preventDefault();
  inputDialog.close();
  const v =
      e.submitter?.value === "cancel"
        ? Symbol.for("cancel")
        : runtimeInput.value,
    r = pendingInput;
  pendingInput = null;
  r?.(v);
};
runBtn.onclick = () => start(true);
stepBtn.onclick = () => {
  clearTimeout(timer);
  if (!runner || runner.done) start(false);
  else {
    runner.auto = false;
    state("Pausado");
    advance();
  }
};
pauseBtn.onclick = () => {
  clearTimeout(timer);
  runner.auto = false;
  state("Pausado");
};
resetBtn.onclick = stop;
clearVars.onclick = () => {
  if (runner) runner.vars = {};
  renderVars();
};
clearConsole.onclick = () =>
  (console.innerHTML = '<div class="muted">La salida aparecerá acá.</div>');
speed.oninput = () =>
  (speedLabel.textContent =
    (speed.value / 1000).toFixed(1).replace(".", ",") + " s");
function renderVars() {
  variables.innerHTML =
    !runner || !Object.keys(runner.vars).length
      ? '<span class="muted">Sin valores</span>'
      : Object.entries(runner.vars)
          .map(
            ([k, v]) =>
              `<div class="variable"><b>${esc(k)}</b><span>${esc(JSON.stringify(v))}</span></div>`,
          )
          .join("");
}

// Crea una copia simple del proyecto que JSON puede guardar sin problemas.
function localProjectSnapshot() {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    name: projectName.value,
    blocks,
    declarations,
    method,
    colors: colorToggle.checked,
    darkTheme: darkToggle.checked,
    interface: interfaceToggleEl.checked ? "modern" : "classic",
  };
}

// Actualiza el texto y los botones del menú de guardado local.
function updateAutoSaveStatus(savedProject = null) {
  let project = savedProject;
  if (!project) {
    try {
      project = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY));
    } catch {
      project = null;
    }
  }

  const exists = Boolean(project?.savedAt);
  localRestoreBtn.disabled = !exists;
  localDeleteBtn.disabled = !exists;
  autoSaveStatus.textContent = exists
    ? `Última copia: ${new Date(project.savedAt).toLocaleString("es-AR")}`
    : "Todavía no hay una copia local.";
}

// Guarda inmediatamente el proyecto actual dentro del navegador.
function saveLocalProject(showMessage = false) {
  try {
    const snapshot = localProjectSnapshot();
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(snapshot));
    updateAutoSaveStatus(snapshot);
    if (showMessage) toast("Copia local guardada");
  } catch {
    if (showMessage) toast("No se pudo guardar la copia local");
  }
}

// Espera un instante antes de guardar para no escribir por cada tecla pulsada.
function scheduleAutoSave() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => saveLocalProject(false), 500);
}

// Restaura todos los datos editables desde la última copia automática.
function restoreLocalProject(showMessage = true) {
  try {
    const savedProject = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY));
    if (!savedProject?.blocks) {
      if (showMessage) toast("No hay una copia local para restaurar");
      updateAutoSaveStatus();
      return false;
    }

    stop();
    blocks = savedProject.blocks;
    declarations = savedProject.declarations || [];
    method = savedProject.method || method;
    projectName.value = savedProject.name || "Proyecto sin título";
    colorToggle.checked = savedProject.colors !== false;
    darkToggle.checked = Boolean(savedProject.darkTheme);
    document.body.classList.toggle("dark-theme", darkToggle.checked);
    localStorage.setItem("ns-theme", darkToggle.checked ? "dark" : "light");
    applyInterface(savedProject.interface !== "classic");
    nextId = Math.max(0, ...all().map((block) => Number(block.id) || 0)) + 1;
    selectedId = blocks[0]?.id || null;
    updateAutoSaveStatus(savedProject);
    if (showMessage) {
      render();
      toast("Copia local restaurada");
    }
    return true;
  } catch {
    if (showMessage) toast("La copia local está dañada");
    return false;
  }
}

// Los tres botones permiten controlar manualmente la copia automática.
localSaveBtn.onclick = () => saveLocalProject(true);
localRestoreBtn.onclick = () => restoreLocalProject(true);
localDeleteBtn.onclick = () => {
  if (!confirm("¿Eliminar la copia local de este proyecto?")) return;
  localStorage.removeItem(LOCAL_STORAGE_KEY);
  updateAutoSaveStatus();
  toast("Copia local eliminada");
};

function toast(t) {
  toastEl.textContent = t;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 1600);
}
const toastEl = $("#toast");

// Al iniciar se recupera automáticamente la última sesión, si existe.
restoreLocalProject(false);
updateAutoSaveStatus();
render();

const renderWithoutTypeColors = render;
render = function () {
  renderWithoutTypeColors();
  $$(".ns-block").forEach((el) => {
    const block = find(Number(el.dataset.id));
    if (block) el.classList.add("type-" + block.type);
  });
  setupDragDrop();
  scheduleAutoSave();
};
render();

// ---------- DRAG & DROP ----------
let dragged = null;
function includesBlock(block, id) {
  let yes = block.id === id;
  for (const key of ["then", "else", "body", "default"])
    if (Array.isArray(block[key]))
      walk(block[key], (b) => (b.id === id ? ((yes = true), true) : false));
  if (block.cases)
    for (const item of block.cases)
      walk(item.body, (b) => (b.id === id ? ((yes = true), true) : false));
  return yes;
}
function dragPayload(event) {
  try {
    return JSON.parse(event.dataTransfer.getData("application/x-ns-block"));
  } catch {
    return dragged;
  }
}
function removeDragged(payload) {
  if (payload?.origin !== "diagram") return null;
  const loc = locate(payload.id);
  if (!loc) return null;
  return loc.a.splice(loc.i, 1)[0];
}
function droppedBlock(payload) {
  return payload?.origin === "palette"
    ? fresh(payload.type)
    : removeDragged(payload);
}
function finishDrop() {
  dragged = null;
  $$(".drop-before,.drop-after,.drop-inside").forEach((el) =>
    el.classList.remove("drop-before", "drop-after", "drop-inside"),
  );
}
function setupDragDrop() {
  // Conecta tanto los bloques de la paleta como los bloques ya insertados.
  $$(".block-option").forEach((el) => {
    el.draggable = true;
    el.ondragstart = (e) => {
      dragged = { origin: "palette", type: el.dataset.add };
      e.dataTransfer.effectAllowed = "copy";
      e.dataTransfer.setData("application/x-ns-block", JSON.stringify(dragged));
      el.classList.add("dragging");
    };
    el.ondragend = () => {
      el.classList.remove("dragging");
      finishDrop();
    };
  });
  $$(".ns-block").forEach((el) => {
    el.draggable = true;
    el.title = "Arrastrá para mover";
    el.ondragstart = (e) => {
      if (e.target.closest(".editable")) {
        e.preventDefault();
        return;
      }
      dragged = { origin: "diagram", id: Number(el.dataset.id) };
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("application/x-ns-block", JSON.stringify(dragged));
      setTimeout(() => el.classList.add("dragging"), 0);
    };
    el.ondragend = () => {
      el.classList.remove("dragging");
      finishDrop();
    };
    el.ondragover = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const top =
        e.clientY < el.getBoundingClientRect().top + el.offsetHeight / 2;
      el.classList.toggle("drop-before", top);
      el.classList.toggle("drop-after", !top);
    };
    el.ondragleave = () => el.classList.remove("drop-before", "drop-after");
    el.ondrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const p = dragPayload(e),
        targetId = Number(el.dataset.id);
      if (
        p?.origin === "diagram" &&
        (p.id === targetId || includesBlock(find(p.id), targetId))
      )
        return finishDrop();
      const before =
          e.clientY < el.getBoundingClientRect().top + el.offsetHeight / 2,
        b = droppedBlock(p),
        loc = locate(targetId);
      if (!b || !loc) return finishDrop();
      loc.a.splice(loc.i + (before ? 0 : 1), 0, b);
      selectedId = b.id;
      finishDrop();
      render();
    };
  });
  $$("[data-container]").forEach((el) => {
    el.ondragover = (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.add("drop-inside");
    };
    el.ondragleave = () => el.classList.remove("drop-inside");
    el.ondrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const p = dragPayload(e),
        [parentId] = el.dataset.container.split(":");
      if (
        p?.origin === "diagram" &&
        includesBlock(find(p.id), Number(parentId))
      )
        return finishDrop();
      const target = targetListFor(el.dataset.container),
        b = droppedBlock(p);
      if (!target || !b) return finishDrop();
      target.push(b);
      selectedId = b.id;
      finishDrop();
      render();
    };
  });
  diagram.ondragover = (e) => {
    if (e.target === diagram) {
      e.preventDefault();
      diagram.classList.add("drop-inside");
    }
  };
  diagram.ondragleave = (e) => {
    if (e.target === diagram) diagram.classList.remove("drop-inside");
  };
  diagram.ondrop = (e) => {
    if (e.target !== diagram) return;
    e.preventDefault();
    const b = droppedBlock(dragPayload(e));
    if (b) {
      blocks.push(b);
      selectedId = b.id;
    }
    finishDrop();
    diagram.classList.remove("drop-inside");
    render();
  };
}
function targetListFor(value) {
  const [id, key] = value.split(":"),
    b = find(Number(id));
  if (!b) return null;
  if (key.startsWith("case")) return b.cases[Number(key.slice(4))].body;
  return b[key];
}

// El elemento de salida no puede compartir el nombre con window.console.
const outputConsole = $("#console");
out = function (value, className = "") {
  const line = document.createElement("div");
  line.textContent = String(value);
  line.className = className;
  outputConsole.append(line);
  outputConsole.scrollTop = outputConsole.scrollHeight;
};
clearConsole.onclick = () =>
  (outputConsole.innerHTML =
    '<div class="muted">La salida aparecerá acá.</div>');
