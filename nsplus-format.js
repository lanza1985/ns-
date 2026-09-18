// Importación y exportación del formato compatible con NS Plus.
const inputHtml = (value) =>
  `<input class="input-for-statement" type="text" value="${esc(value)}" style="width: ${Math.max(3.5, String(value ?? "").length + 0.5)}ch;">`;

// ---------- COMPATIBILIDAD CON ARCHIVOS NS PLUS ----------
function nsPlusCode(source, sourceDeclarations = declarations, sourceMethod = method) {
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
      return `<div id="${own("conditional-statement")}" droppable="false" class="conditional-statement switch block-container" type="switch"${marker}><div class="header"><div class="option true"><div class="option-block"><canvas class="corner corner-true"></canvas><div class="caption">&nbsp;</div></div></div><div class="condition">${inputHtml(block.expression)}</div><div class="option false"><div class="option-block"><canvas class="corner corner-false"></canvas><div class="caption">&nbsp;</div></div></div></div><div class="body">${block.cases.map((item) => `<div class="case"><div class="test-value">${inputHtml(item.value)}</div><div class="statements">${statements(item.body)}</div></div>`).join("")}${Array.isArray(block.default) ? `<div class="case"><div class="test-value">${inputHtml("default")}</div><div class="statements">${statements(block.default)}</div></div>` : ""}</div></div>`;
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
  const parameters = sourceDeclarations
    .filter((item) => item.kind === "parameter")
    .map(declarationToNsPlus)
    .join("");
  const locals = sourceDeclarations
    .filter((item) => item.kind !== "parameter")
    .map(declarationToNsPlus)
    .join("");
  const declaration = `<div id="${id("method-declaration")}" droppable="false" class="method-declaration"><div class="class-declaration"><div class="fixed-value-in-statement">class</div><div class="class-name">${inputHtml(sourceMethod.className)}</div><div class="fixed-value-in-statement">:</div></div><div class="method-signature"><div class="method-modifiers">${inputHtml(sourceMethod.modifiers)}</div><div class="method-type">${inputHtml(sourceMethod.returnType)}</div><div class="method-name">${inputHtml(sourceMethod.name)}</div><div class="fixed-value-in-statement">(</div><div class="method-parameters">${parameters}</div><div class="fixed-value-in-statement">)</div></div></div>`;
  return `${declaration}<div class="local-variable-declaration">${locals}</div><div class="statements">${statements(source)}</div>`;
}

function createNsPlusFile() {
  // El archivo final respeta exactamente el contenedor .nsplus versión 0.5.
  // Además del HTML que entiende NS Plus, conservamos nuestro árbol original.
  // Volver a deducirlo desde HTML hace que detalles de diagramas anidados se
  // puedan perder (y que el resultado dependa del parser del navegador).
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
    diagrams: diagrams.map((item, index) => ({
      id: `NSPDiagram-${index + 1}`,
      theClass: item.method.className,
      name: item.method.name,
      code: nsPlusCode(item.blocks, item.declarations, item.method),
    })),
    usr: "Sin autor",
    uid: null,
    com: "Sin comisión",
    date: now,
    minutes: 0,
    meta: utf8ToBase64(JSON.stringify(audit)),
    editorState: {
      version: 2,
      diagrams,
      activeDiagramId,
    },
  };
  return { ver: 0.5, data: reverse(utf8ToBase64(JSON.stringify(project))) };
}

// Los archivos de otros editores no incluyen editorState: en ese caso se usa
// el lector de HTML de siempre. Sólo aceptamos la copia exacta si tiene la
// forma mínima esperada, para no convertir un archivo mal formado en proyecto.
function hasEditorState(value) {
  return (
    value &&
    ((value.version === 1 && Array.isArray(value.blocks) && Array.isArray(value.declarations) && value.method) ||
      (value.version === 2 && Array.isArray(value.diagrams)))
  );
}

function useDiagrams(items, preferredId = null) {
  diagrams = items.filter((item) => Array.isArray(item.blocks)).map((item, index) => ({
    id: item.id || `diagram-${index + 1}`,
    blocks: item.blocks,
    declarations: item.declarations || [],
    method: item.method || { className: "LaClase", modifiers: "public", returnType: "void", name: "main" },
  }));
  if (!diagrams.length) throw new Error("Estructura inválida");
  nextDiagramId = Math.max(0, ...diagrams.map((item) => Number(String(item.id).match(/(\d+)$/)?.[1]) || 0)) + 1;
  const active = diagrams.find((item) => item.id === preferredId) || diagrams[0];
  activeDiagramId = active.id;
  blocks = active.blocks;
  declarations = active.declarations;
  method = active.method;
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
        default: fallbackIndex >= 0 ? fallback : null,
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
      if (hasEditorState(original.editorState)) {
        const state = original.editorState;
        useDiagrams(state.version === 2 ? state.diagrams : [{ id: "diagram-1", blocks: state.blocks, declarations: state.declarations, method: state.method }], state.activeDiagramId);
      } else {
        useDiagrams((original.diagrams || []).map((item, index) => ({ id: `diagram-${index + 1}`, ...parseNsPlusCode(item.code || "") })));
      }
      projectName.value =
        original.name || "Proyecto importado";
    } else {
      useDiagrams(d.diagrams || [{ id: "diagram-1", blocks: d.blocks, declarations: d.declarations || [], method: d.method || method }], d.activeDiagramId);
      projectName.value = d.name || "Proyecto importado";
    }
    nextId = Math.max(0, ...diagrams.flatMap((item) => allBlocks(item.blocks).map((b) => b.id))) + 1;
    selectedId = blocks[0]?.id || null;
    render();
    toast("Proyecto abierto");
  } catch {
    toast("Archivo no válido");
  }
};
exportBtn.onclick = () => window.print();
