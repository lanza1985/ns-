// Editor: modelo del diagrama, renderizado y controles de la interfaz.
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
diagrams = [{ id: "diagram-1", blocks, declarations, method }];
activeDiagramId = "diagram-1";

// ---------- DIBUJO DEL DIAGRAMA ----------
const ed = (v, id, f) =>
  `<span class="editable" contenteditable="true" spellcheck="false" data-id="${id}" data-field="${f}">${esc(v)}</span>`;
const list = (a) => a.map(blockHTML).join("");

// Convierte un bloque de datos en el HTML visible del diagrama.
function blockHTML(b) {
  const callError = b.type === "call" ? callValidationError(b.code) : "";
  const c = `ns-block ${b.id === selectedId ? "selected " : ""}${runner?.current === b.id ? "active " : ""}${runner?.error === b.id ? "execution-error " : ""}${callError ? "invalid-call " : ""}`;
  if (b.type === "input")
    return `<div class="${c}" data-id="${b.id}"><div class="line"><b class="tag">E</b>${ed(b.name, b.id, "name")}</div></div>`;
  if (b.type === "output")
    return `<div class="${c}" data-id="${b.id}"><div class="line"><b class="tag">S</b>${ed(b.expression, b.id, "expression")}</div></div>`;
  if (b.type === "comment")
    return `<div class="${c}" data-id="${b.id}"><div class="line comment">/* ${ed(b.text, b.id, "text")} */</div></div>`;
  if (["instruction", "call"].includes(b.type))
    return `<div class="${c}" data-id="${b.id}"${callError ? ` title="${esc(callError)}"` : ""}><div class="line">${ed(b.code, b.id, "code")}</div></div>`;
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
  if (b.type === "switch") {
    const defaultCase = Array.isArray(b.default)
      ? `<div class="case-row default-case"><div class="case-label">default<button class="case-action remove-case" type="button" data-switch-action="remove-default" title="Quitar default" aria-label="Quitar default">×</button></div><div class="case-body" data-container="${b.id}:default">${b.default.length ? list(b.default) : empty()}</div></div>`
      : `<div class="switch-actions"><button class="case-action add-case" type="button" data-switch-action="add-default">+ Agregar default</button></div>`;
    return `<div class="${c}" data-id="${b.id}"><div class="flow-marker flow-start">SEGÚN · INICIO</div><div class="condition">según ${ed(b.expression, b.id, "expression")}</div>${b.cases.map((x, i) => `<div class="case-row"><div class="case-label">${ed(x.value, b.id, "case" + i)}<button class="case-action remove-case" type="button" data-switch-action="remove-case" data-case-index="${i}" title="Quitar opción" aria-label="Quitar opción ${i + 1}">×</button></div><div class="case-body" data-container="${b.id}:case${i}">${x.body.length ? list(x.body) : empty()}</div></div>`).join("")}<div class="switch-actions"><button class="case-action add-case" type="button" data-switch-action="add-case">+ Agregar opción</button></div>${defaultCase}<div class="flow-marker flow-end">FIN SEGÚN</div></div>`;
  }
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
function classDeclarationsHTML(className) {
  const fields = classDeclarations[className] || [];
  return `<section class="class-variables" data-class-name="${esc(className)}">
    <div class="class-variables-head"><strong>Variables de clase · ${esc(className)}</strong><button type="button" data-add-class-variable>+ Variable</button></div>
    <div class="class-variables-list">${fields.length ? fields.map((item, index) => `<div class="class-variable-row">
      <select data-class-kind="${index}" aria-label="Tipo de variable ${esc(item.name)}"><option value="variable"${item.kind === "variable" ? " selected" : ""}>Variable</option><option value="declare"${item.kind === "declare" ? " selected" : ""}>Inicializada</option><option value="constant"${item.kind === "constant" ? " selected" : ""}>Constante</option></select>
      <span class="editable declaration-field" contenteditable="true" spellcheck="false" data-class-declaration="${index}" data-class-field="dataType">${esc(item.dataType)}</span>
      <span class="editable declaration-field" contenteditable="true" spellcheck="false" data-class-declaration="${index}" data-class-field="name">${esc(item.name)}</span>
      ${item.kind !== "variable" ? `← <span class="editable declaration-field" contenteditable="true" spellcheck="false" data-class-declaration="${index}" data-class-field="expression">${esc(item.expression)}</span>` : ""}
      <button class="remove-declaration" type="button" data-remove-class-variable="${index}" aria-label="Eliminar variable ${esc(item.name)}">×</button>
    </div>`).join("") : '<span class="class-variables-empty">Sin variables de clase</span>'}</div>
  </section>`;
}
function render() {
  // El lienzo muestra todos los métodos de la clase activa; al terminar se
  // restauran los alias globales para que los controles editen el método activo.
  const active = diagrams.find((item) => item.id === activeDiagramId) || diagrams[0];
  const activeClassName = String(active.method?.className ?? "").trim() || "Sin clase";
  diagram.innerHTML = classDeclarationsHTML(activeClassName) + diagrams.filter((item) => (String(item.method?.className ?? "").trim() || "Sin clase") === activeClassName).map((item) => {
    blocks = item.blocks;
    declarations = item.declarations;
    method = item.method;
    const collapsed = Boolean(item.collapsed);
    return `<section class="ns-method${item.id === activeDiagramId ? " is-active" : ""}${collapsed ? " is-collapsed" : ""}" data-method-diagram="${esc(item.id)}">
      <div class="ns-method-bar"><button class="ns-method-toggle" type="button" data-toggle-method="${esc(item.id)}" aria-expanded="${!collapsed}" aria-label="${collapsed ? "Expandir" : "Contraer"} ${esc(diagramLabel(item))}"><span aria-hidden="true">${collapsed ? "▸" : "▾"}</span></button><strong>${esc(diagramLabel(item))}</strong></div>
      <div class="ns-method-content"${collapsed ? " hidden" : ""}>${declarationHTML()}<div class="ns-method-blocks" data-root-diagram="${esc(item.id)}">${item.blocks.length ? list(item.blocks) : '<div class="ns-method-empty">Elegí un bloque o arrastralo aquí.</div>'}</div></div>
    </section>`;
  }).join("");
  blocks = active.blocks;
  declarations = active.declarations;
  method = active.method;
  diagram.style.display = "block";
  emptyState.hidden = true;
  renderDiagramList();
  main.classList.toggle("no-colors", !colorToggle.checked);
  bind();
  bindMethodSections();
  renderVars();
}

function activateDiagramContext(id) {
  // Un clic, foco o arrastre sobre otro método cambia el destino de las
  // acciones sin reconstruir el DOM ni perder el elemento que recibió el evento.
  const item = diagrams.find((entry) => entry.id === id);
  if (!item || item.id === activeDiagramId) return;
  if (runner) {
    clearTimeout(timer);
    timer = null;
    runner = null;
    state("Listo");
    renderVars();
  }
  activeDiagramId = item.id;
  blocks = item.blocks;
  declarations = item.declarations;
  method = item.method;
  selectedId = null;
  $$(".ns-block.selected").forEach((block) => block.classList.remove("selected"));
  $$(".ns-method").forEach((section) => section.classList.toggle("is-active", section.dataset.methodDiagram === id));
  $$(".project-card").forEach((card) => card.classList.toggle("active", card.querySelector("[data-diagram-id]")?.dataset.diagramId === id));
  scheduleAutoSave();
}

function bindMethodSections() {
  $("[data-add-class-variable]").onclick = () => {
    const className = $(".class-variables").dataset.className;
    (classDeclarations[className] ||= []).push({ kind: "variable", dataType: "Integer", name: "variable", expression: "" });
    render();
  };
  $$('[data-class-kind]').forEach((select) => {
    select.onchange = () => {
      const fields = classDeclarations[select.closest(".class-variables").dataset.className];
      const field = fields[Number(select.dataset.classKind)];
      field.kind = select.value;
      if (field.kind !== "variable" && !field.expression) field.expression = "0";
      render();
    };
  });
  $$('[data-remove-class-variable]').forEach((button) => {
    button.onclick = () => {
      classDeclarations[button.closest(".class-variables").dataset.className].splice(Number(button.dataset.removeClassVariable), 1);
      render();
    };
  });
  $$(".ns-method").forEach((section) => {
    section.addEventListener("pointerdown", () => activateDiagramContext(section.dataset.methodDiagram), true);
    section.addEventListener("focusin", () => activateDiagramContext(section.dataset.methodDiagram), true);
  });
  $$('[data-toggle-method]').forEach((button) => {
    button.onclick = () => {
      const item = diagrams.find((entry) => entry.id === button.dataset.toggleMethod);
      if (!item) return;
      item.collapsed = !item.collapsed;
      render();
    };
  });
}

function diagramLabel(item) {
  const className = String(item.method?.className ?? "").trim() || "Sin clase";
  const methodName = String(item.method?.name ?? "").trim() || "sinMétodo";
  return `${className}.${methodName}`;
}

function renderDiagramList() {
  const classes = new Map();
  const activeClassName = String(diagrams.find((item) => item.id === activeDiagramId)?.method?.className ?? "").trim() || "Sin clase";
  diagrams.forEach((item) => {
    const className = String(item.method?.className ?? "").trim() || "Sin clase";
    if (!classes.has(className)) classes.set(className, []);
    classes.get(className).push(item);
  });
  diagramList.innerHTML = [...classes]
    .map(([className, methods]) => `<section class="class-card${className === activeClassName ? " active-class" : ""}">
      <button class="class-card-header class-card-select" type="button" data-class-first-diagram="${esc(methods[0].id)}" aria-label="Mostrar clase ${esc(className)}"><span class="mini-diagram">▤</span><b>${esc(className)}</b></button>
      <div class="class-method-list">${methods
        .map((item, index) => `<div class="project-card ${item.id === activeDiagramId ? "active" : ""}">
          <button class="project-card-select" data-diagram-id="${esc(item.id)}"><span><b>${esc(String(item.method?.name ?? "").trim() || "sinMétodo")}</b><small>${index === 0 ? "Método" : "Método de la clase"}</small></span></button>
          <button class="remove-diagram" type="button" data-remove-diagram="${esc(item.id)}" title="Eliminar diagrama" aria-label="Eliminar diagrama ${esc(String(item.method?.name ?? "").trim() || "sinMétodo")}">×</button>
        </div>`)
        .join("")}</div>
    </section>`)
    .join("");
  $$('[data-diagram-id]').forEach((button) => {
    button.onclick = () => selectDiagram(button.dataset.diagramId);
  });
  $$('[data-class-first-diagram]').forEach((button) => {
    button.onclick = () => selectDiagram(button.dataset.classFirstDiagram);
  });
  $$('[data-remove-diagram]').forEach((button) => {
    button.onclick = (event) => {
      event.stopPropagation();
      removeDiagram(button.dataset.removeDiagram);
    };
  });
}

function selectDiagram(id) {
  const item = diagrams.find((diagramItem) => diagramItem.id === id);
  if (!item) return;
  if (item.id !== activeDiagramId) stop();
  item.collapsed = false;
  activeDiagramId = item.id;
  blocks = item.blocks;
  declarations = item.declarations;
  method = item.method;
  selectedId = blocks[0]?.id || null;
  render();
  [...diagram.querySelectorAll("[data-method-diagram]")].find((section) => section.dataset.methodDiagram === item.id)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function createDiagram(className = null) {
  const number = diagrams.length + 1;
  const existingClassName =
    typeof className === "string" ? className.trim() : "";
  const item = {
    id: `diagram-${nextDiagramId++}`,
    blocks: [],
    declarations: [],
    method: {
      className: existingClassName || `Clase${number}`,
      modifiers: "public",
      returnType: "void",
      name: `metodo${number}`,
    },
  };
  diagrams.push(item);
  activeDiagramId = item.id;
  blocks = item.blocks;
  declarations = item.declarations;
  method = item.method;
  selectedId = null;
  render();
  toast(existingClassName ? "Nuevo método creado" : "Nuevo diagrama creado");
}

function removeDiagram(id) {
  if (diagrams.length === 1) {
    toast("El proyecto debe conservar al menos un diagrama");
    return;
  }
  const index = diagrams.findIndex((item) => item.id === id);
  if (index < 0) return;
  if (!confirm(`¿Eliminar el diagrama ${diagramLabel(diagrams[index])}?`)) return;
  const [removed] = diagrams.splice(index, 1);
  if (!diagrams.some((item) => item.method.className === removed.method.className)) delete classDeclarations[removed.method.className.trim() || "Sin clase"];
  if (removed.id === activeDiagramId) {
    const replacement = diagrams[Math.min(index, diagrams.length - 1)];
    activeDiagramId = replacement.id;
    blocks = replacement.blocks;
    declarations = replacement.declarations;
    method = replacement.method;
    selectedId = blocks[0]?.id || null;
  }
  render();
  toast("Diagrama eliminado");
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

function findBlockInDiagram(item, id) {
  let result;
  if (!item) return result;
  walk(item.blocks, (block) => {
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
    const owner = diagrams.find((item) => item.id === el.closest("[data-method-diagram]")?.dataset.methodDiagram);
    if (el.dataset.field === "code" && findBlockInDiagram(owner, +el.dataset.id)?.type === "call") {
      el.onfocus = () => showCallAutocomplete(el);
      el.oninput = () => showCallAutocomplete(el);
    }
    el.onblur = () => {
      window.setTimeout(hideCallAutocomplete, 0);
      if (el.dataset.method) {
        const field = el.dataset.method;
        const value = el.textContent.trim();
        if (field === "className") {
          // Renombrar la clase afecta a todos sus métodos y mueve sus variables
          // compartidas; si el destino existe, conserva sus nombres existentes.
          const previousClassName = owner.method.className;
          diagrams
            .filter((item) => item.method.className === previousClassName)
            .forEach((item) => (item.method.className = value));
          const oldKey = previousClassName.trim() || "Sin clase";
          const newKey = value.trim() || "Sin clase";
          if (oldKey !== newKey && classDeclarations[oldKey]) {
            const existing = classDeclarations[newKey] || [];
            classDeclarations[newKey] = [...existing, ...classDeclarations[oldKey].filter((variable) => !existing.some((other) => other.name === variable.name))];
            delete classDeclarations[oldKey];
          }
        } else owner.method[field] = value;
        render();
        return;
      }
      if (el.dataset.classDeclaration !== undefined) {
        const fields = classDeclarations[el.closest(".class-variables").dataset.className];
        fields[Number(el.dataset.classDeclaration)][el.dataset.classField] = el.textContent.trim();
        render();
        return;
      }
      if (el.dataset.declaration) {
        owner.declarations[+el.dataset.declaration][el.dataset.declarationField] =
          el.textContent.trim();
        render();
        return;
      }
      const b = findBlockInDiagram(owner, +el.dataset.id),
        f = el.dataset.field;
      if (f.startsWith("case"))
        b.cases[+f.slice(4)].value = el.textContent.trim();
      else b[f] = el.textContent.trim();
      render();
    };
    el.onkeydown = (e) => {
      if (autocompleteField === el && !callAutocomplete.hidden) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          activeCallSuggestion = (activeCallSuggestion + (e.key === "ArrowDown" ? 1 : -1) + callSuggestions.length) % callSuggestions.length;
          drawCallAutocomplete();
          return;
        }
        if ((e.key === "Enter" || e.key === "Tab") && callSuggestions.length) {
          e.preventDefault();
          applyCallSuggestion(callSuggestions[activeCallSuggestion]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          hideCallAutocomplete();
          return;
        }
      }
      if (e.key === "Enter") {
        e.preventDefault();
        el.blur();
      }
    };
  });
  $$('[data-switch-action]').forEach((button) => {
    button.onclick = (event) => {
      event.stopPropagation();
      const block = find(+button.closest(".ns-block").dataset.id);
      if (!block || block.type !== "switch") return;
      if (button.dataset.switchAction === "add-case")
        block.cases.push({ value: `valor${block.cases.length + 1}`, body: [] });
      else if (button.dataset.switchAction === "remove-case")
        block.cases.splice(+button.dataset.caseIndex, 1);
      else if (button.dataset.switchAction === "add-default") block.default = [];
      else if (button.dataset.switchAction === "remove-default") block.default = null;
      selectedId = block.id;
      render();
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
    instruction: { code: "variable = {}" },
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
    declMethod: "method",
    declParameter: "parameter",
    declConstant: "constant",
    declVariable: "variable",
    declInitialized: "declare",
  };
  if (declarationKinds[t] === "method") {
    createDiagram(method.className.trim() || "LaClase");
    return;
  }
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
typeDropdown.onclick = (e) => e.stopPropagation();
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
darkToggle.checked = localStorage.getItem("ns-theme") !== "light";
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
  // Durante el arranque, persistencia.js todavía no se cargó.
  if (typeof scheduleAutoSave === "function") scheduleAutoSave();
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
  classDeclarations = Object.create(null);
  umlState = { classes: [], relations: [], nextId: 1 };
  editorMode = "ns";
  if (typeof showEditorMode === "function") showEditorMode("ns");
  blocks = [];
  declarations = [];
  method = {
    className: "LaClase",
    modifiers: "public",
    returnType: "void",
    name: "main",
  };
  diagrams = [{ id: "diagram-1", blocks, declarations, method }];
  activeDiagramId = "diagram-1";
  nextDiagramId = 2;
  selectedId = null;
  projectName.value = "Proyecto sin título";
  render();
};
// No pasar el evento de click como nombre de clase: createDiagram() usa su
// argumento opcional para crear un método dentro de una clase existente.
newDiagramBtn.onclick = () => createDiagram();
loadExample.onclick = () => {
  stop();
  classDeclarations = Object.create(null);
  blocks = example();
  declarations = [
    { kind: "declare", dataType: "Integer", name: "suma", expression: "0" },
  ];
  selectedId = blocks[0].id;
  diagrams = [{ id: "diagram-1", blocks, declarations, method }];
  activeDiagramId = "diagram-1";
  nextDiagramId = 2;
  projectName.value = "Promedio";
  diagramsPanel.classList.remove("open");
  render();
};
