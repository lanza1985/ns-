// Editor de diagramas de clases UML. Usa el mismo proyecto y guardado de NS#.
const umlEditor = $("#umlEditor");
const umlClassesEl = $("#umlClasses");
const umlLinesEl = $("#umlLines");
const umlCanvasEl = $("#umlCanvas");
const umlHintEl = $("#umlHint");
let umlSelected = null;
let umlConnecting = false;
let umlConnectionStart = null;
let umlInspectorRelationId = null;

function showEditorMode(mode) {
  editorMode = mode === "uml" ? "uml" : "ns";
  document.body.classList.toggle("uml-mode", editorMode === "uml");
  umlEditor.hidden = editorMode !== "uml";
  $("#nsModeBtn").classList.toggle("active", editorMode === "ns");
  $("#umlModeBtn").classList.toggle("active", editorMode === "uml");
  $("#nsModeBtn").setAttribute("aria-pressed", editorMode === "ns");
  $("#umlModeBtn").setAttribute("aria-pressed", editorMode === "uml");
  if (editorMode === "uml") {
    stop();
    renderUml();
  }
  scheduleAutoSave();
}

function umlNewId(prefix) {
  let id;
  do id = `${prefix}-${umlState.nextId++}`;
  while (umlState.classes.some((item) => item.id === id) || umlState.relations.some((item) => item.id === id));
  return id;
}

function umlMemberLines(value) {
  return String(value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function umlAttributeAt(source, index) {
  const line = umlMemberLines(source.attributes)[index];
  const declaration = line?.match(/^[+\-#~]?\s*([A-Za-z_$][\w$]*)\s*:\s*(.+)$/);
  if (!declaration) return null;
  return { name: declaration[1], type: declaration[2].split("=")[0].trim(), index };
}

// Las relaciones inferidas se calculan desde los atributos. Al cambiar su tipo,
// se guarda sólo esa relación como manual y las demás siguen siendo inferidas.
function umlInferredRelations(classes = umlState.classes, manualRelations = umlState.relations) {
  const names = new Map();
  classes.forEach((item) => {
    const name = item.name.trim();
    if (name) names.set(name, [...(names.get(name) || []), item]);
  });
  const matches = [];
  classes.forEach((source) => {
    if (source.kind === "enum") return;
    umlMemberLines(source.attributes).forEach((line, attributeIndex) => {
      const attribute = umlAttributeAt(source, attributeIndex);
      if (!attribute) return;
      // Incluye tipos de colección como List<Cliente> y Cliente[].
      const tokens = attribute.type.match(/[A-Za-z_$][\w$]*/g) || [];
      [...new Set(tokens)].forEach((token) => {
        const candidates = names.get(token);
        if (candidates?.length !== 1 || candidates[0].id === source.id) return;
        const target = candidates[0];
        const covered = manualRelations.some((relation) => {
          const samePair = [relation.from, relation.to].sort().join("|") === [source.id, target.id].sort().join("|");
          return samePair && (relation.attributeIndex === undefined || (relation.from === source.id && relation.attributeIndex === attributeIndex));
        });
        if (covered) return;
        matches.push({ id: `auto-${source.id}-${attributeIndex}-${target.id}`, from: source.id, to: target.id, type: "association", multiplicity: "1", label: `${attribute.name}: ${attribute.type}`, attributeIndex, auto: true });
      });
    });
  });
  return matches;
}

function umlClassHeight(item) {
  const el = [...umlClassesEl.children].find((node) => node.dataset.umlClass === item.id);
  return el?.offsetHeight || 100;
}

function umlEndpoint(from, to) {
  const fh = umlClassHeight(from), th = umlClassHeight(to);
  const dx = to.x + to.width / 2 - from.x - from.width / 2;
  const dy = to.y + th / 2 - from.y - fh / 2;
  if (Math.abs(dx) > Math.abs(dy) * 1.2) {
    return {
      x1: dx > 0 ? from.x + from.width : from.x,
      y1: from.y + fh / 2,
      x2: dx > 0 ? to.x : to.x + to.width,
      y2: to.y + th / 2,
    };
  }
  return {
    x1: from.x + from.width / 2,
    y1: dy > 0 ? from.y + fh : from.y,
    x2: to.x + to.width / 2,
    y2: dy > 0 ? to.y : to.y + th,
  };
}

function umlAutoEndpoint(item, from, to) {
  // La línea automática nace en la sección de atributos (aunque el atributo
  // aparezca sólo como etiqueta de la relación) y llega al encabezado destino.
  const source = [...umlClassesEl.children].find((node) => node.dataset.umlClass === from.id);
  const target = [...umlClassesEl.children].find((node) => node.dataset.umlClass === to.id);
  const row = source?.querySelector(".uml-class-members");
  const header = target?.querySelector(".uml-class-title");
  if (!source || !target || !row || !header) return null;
  const canvas = umlCanvasEl.getBoundingClientRect();
  const sourceRect = source.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  const headerRect = header.getBoundingClientRect();
  const right = sourceRect.right <= targetRect.left || (sourceRect.left < targetRect.right && targetRect.left < sourceRect.right && sourceRect.left + sourceRect.width / 2 <= targetRect.left + targetRect.width / 2);
  const left = sourceRect.left >= targetRect.right || (!right && sourceRect.left + sourceRect.width / 2 > targetRect.left + targetRect.width / 2);
  const sourceX = (right ? sourceRect.right : sourceRect.left) - canvas.left;
  const targetX = (right ? (sourceRect.right <= targetRect.left ? targetRect.left : targetRect.right) : (sourceRect.left >= targetRect.right ? targetRect.right : targetRect.left)) - canvas.left;
  const peers = [...umlInferredRelations(), ...umlState.relations.filter((relation) => relation.type === "association" && relation.attributeIndex !== undefined)]
    .filter((relation) => relation.from === from.id && relation.to === to.id)
    .sort((a, b) => a.attributeIndex - b.attributeIndex);
  const peerIndex = peers.findIndex((relation) => relation.id === item.id);
  const offset = peerIndex < 0 ? 0 : (peerIndex - (peers.length - 1) / 2) * 24;
  const sourceY = rowRect.top + rowRect.height / 2 - canvas.top + offset;
  const targetY = headerRect.top + headerRect.height / 2 - canvas.top + offset;
  const separated = right ? sourceRect.right <= targetRect.left : sourceRect.left >= targetRect.right;
  const routeX = (separated ? (sourceX + targetX) / 2 : (left ? Math.min(sourceRect.left, targetRect.left) - canvas.left - 28 : Math.max(sourceRect.right, targetRect.right) - canvas.left + 28)) + offset;
  return { sourceX, sourceY, targetX, targetY, routeX };
}

function umlRelationAttributes(from, to) {
  return umlMemberLines(from.attributes).flatMap((line, index) => {
    const attribute = umlAttributeAt(from, index);
    if (!attribute) return [];
    const typeTokens = attribute.type.match(/[A-Za-z_$][\w$]*/g) || [];
    return typeTokens.includes(to.name.trim()) ? [attribute] : [];
  });
}

function umlLinkedAttributes(relation, from, to) {
  return relation.attributeIndex === undefined
    ? umlRelationAttributes(from, to)
    : [umlAttributeAt(from, relation.attributeIndex)].filter(Boolean);
}

function umlRelationAttributeName(relation, from, to) {
  return umlLinkedAttributes(relation, from, to).map((item) => `${item.name}: ${item.type}`).join(", ");
}

function umlMultiplicity(item) {
  return ["1", "0..1", "0..N", "1..N"].includes(item?.multiplicity) ? item.multiplicity : "1";
}

function umlHiddenAttributeIndices(item) {
  const hidden = new Set(umlInferredRelations().filter((relation) => relation.from === item.id).map((relation) => relation.attributeIndex));
  umlState.relations.filter((relation) => relation.from === item.id).forEach((relation) => {
    const target = umlState.classes.find((klass) => klass.id === relation.to);
    if (target) umlLinkedAttributes(relation, item, target).forEach((attribute) => hidden.add(attribute.index));
  });
  return hidden;
}

function umlVisibleAttributes(item) {
  const hidden = umlHiddenAttributeIndices(item);
  return umlMemberLines(item.attributes).filter((line, index) => !hidden.has(index));
}

function umlRelationSvg(item, interactive = true) {
  const from = umlState.classes.find((node) => node.id === item.from);
  const to = umlState.classes.find((node) => node.id === item.to);
  if (!from || !to) return "";
  if (item.auto || (item.type === "association" && item.attributeIndex !== undefined)) {
    const points = umlAutoEndpoint(item, from, to);
    if (!points) return "";
    const { sourceX, sourceY, targetX, targetY, routeX } = points;
    const direction = targetX > routeX ? 1 : -1;
    const anchor = direction > 0 ? "end" : "start";
    const labelText = item.auto ? item.label : item.label || umlRelationAttributeName(item, from, to);
    const label = labelText ? `<text x="${targetX - direction * 38}" y="${targetY - 9}" text-anchor="${anchor}" class="uml-line-label uml-property-label">${esc(labelText)}</text>` : "";
    const multiplicity = `<text x="${targetX - direction * 8}" y="${targetY - 9}" text-anchor="${anchor}" class="uml-line-label uml-multiplicity">${umlMultiplicity(item)}</text>`;
    const selected = umlSelected?.kind === "relation" && umlSelected.id === item.id;
    return `<g class="uml-relation uml-auto${selected ? " selected" : ""}"${interactive ? ` data-uml-relation="${esc(item.id)}"` : ""}><path d="M ${sourceX} ${sourceY} H ${routeX} V ${targetY} H ${targetX}" class="uml-stroke" marker-end="url(#umlAutoArrow)"/>${interactive ? `<path d="M ${sourceX} ${sourceY} H ${routeX} V ${targetY} H ${targetX}" class="uml-hit"/>` : ""}${label}${multiplicity}</g>`;
  }
  const { x1, y1, x2, y2 } = umlEndpoint(from, to);
  const dotted = ["dependency", "implementation"].includes(item.type);
  const end = ["inheritance", "implementation"].includes(item.type) ? ' marker-end="url(#umlTriangle)"' : ["association", "dependency"].includes(item.type) ? ' marker-end="url(#umlArrow)"' : "";
  const start = item.type === "aggregation" ? ' marker-start="url(#umlDiamond)"' : item.type === "composition" ? ' marker-start="url(#umlDiamondFilled)"' : "";
  const selected = umlSelected?.kind === "relation" && umlSelected.id === item.id;
  const labelText = item.label || umlRelationAttributeName(item, from, to);
  const label = labelText ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 9}" text-anchor="middle" class="uml-line-label">${esc(labelText)}</text>` : "";
  const distance = Math.hypot(x2 - x1, y2 - y1) || 1;
  const multiplicity = item.type === "association"
    ? `<text x="${x2 - (x2 - x1) / distance * 22}" y="${y2 - (y2 - y1) / distance * 22 - 9}" text-anchor="middle" class="uml-line-label uml-multiplicity">${umlMultiplicity(item)}</text>`
    : "";
  return `<g class="uml-relation${selected ? " selected" : ""}${item.auto ? " uml-auto" : ""}"${interactive ? ` data-uml-relation="${esc(item.id)}"` : ""}><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="uml-stroke"${dotted ? ' stroke-dasharray="7 5"' : ""}${start}${end}/>${interactive ? `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="uml-hit"/>` : ""}${label}${multiplicity}</g>`;
}

function umlMarkers() {
  return `<defs>
    <marker id="umlTriangle" markerWidth="16" markerHeight="14" refX="15" refY="7" orient="auto" markerUnits="userSpaceOnUse"><path d="M 1 1 L 15 7 L 1 13 Z" fill="var(--uml-paper, #fff)" stroke="var(--uml-ink, #364152)" stroke-width="1.5"/></marker>
    <marker id="umlArrow" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M 1 1 L 11 6 L 1 11" fill="none" stroke="var(--uml-ink, #364152)" stroke-width="1.5"/></marker>
    <marker id="umlAutoArrow" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M 1 1 L 11 6 L 1 11" fill="none" stroke="var(--uml-auto-ink, #3858d6)" stroke-width="1.5"/></marker>
    <marker id="umlDiamond" markerWidth="20" markerHeight="14" refX="18" refY="7" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M 2 7 L 10 1 L 18 7 L 10 13 Z" fill="var(--uml-paper, #fff)" stroke="var(--uml-ink, #364152)" stroke-width="1.5"/></marker>
    <marker id="umlDiamondFilled" markerWidth="20" markerHeight="14" refX="18" refY="7" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M 2 7 L 10 1 L 18 7 L 10 13 Z" fill="var(--uml-ink, #364152)" stroke="var(--uml-ink, #364152)" stroke-width="1.5"/></marker>
  </defs>`;
}

function renderUmlLines() {
  umlLinesEl.innerHTML = umlMarkers() + umlInferredRelations().map((item) => umlRelationSvg(item)).join("") + umlState.relations.map((item) => umlRelationSvg(item)).join("");
}

function umlClassHtml(item) {
  const members = (lines, emptyText) => lines.length
    ? lines.map((line) => `<div>${esc(line)}</div>`).join("")
    : `<div class="uml-placeholder">${emptyText}</div>`;
  const selected = umlSelected?.kind === "class" && umlSelected.id === item.id;
  const pending = umlConnectionStart === item.id;
  const isEnum = item.kind === "enum";
  return `<article class="uml-class${isEnum ? " uml-enum" : ""}${selected ? " selected" : ""}${pending ? " connecting" : ""}" data-uml-class="${esc(item.id)}" style="left:${item.x}px;top:${item.y}px;width:${item.width}px" tabindex="0" aria-label="${isEnum ? "Enum" : "Clase"} ${esc(item.name)}">
    <header class="uml-class-title">${isEnum ? '<span class="uml-stereotype">«enum»</span>' : ""}${esc(item.name || "Sin nombre")}</header>
    <div class="uml-class-members">${members(isEnum ? umlMemberLines(item.literals) : umlVisibleAttributes(item), isEnum ? "Valores" : "Atributos")}</div>
    ${isEnum ? "" : `<div class="uml-class-members">${members(umlMemberLines(item.methods), "Métodos")}</div>`}
    <span class="uml-resize" title="Cambiar ancho" aria-hidden="true"></span>
  </article>`;
}

function renderUmlSelection() {
  const klass = umlSelected?.kind === "class" && umlState.classes.find((item) => item.id === umlSelected.id);
  const relation = umlSelected?.kind === "relation" && (umlState.relations.find((item) => item.id === umlSelected.id) || umlInferredRelations().find((item) => item.id === umlSelected.id));
  const source = relation && umlState.classes.find((item) => item.id === relation.from);
  const target = relation && umlState.classes.find((item) => item.id === relation.to);
  const attributes = source && target ? umlLinkedAttributes(relation, source, target) : [];
  const relationChanged = (relation?.id || null) !== umlInspectorRelationId;
  umlInspectorRelationId = relation?.id || null;
  $("#umlInspectorEmpty").hidden = Boolean(klass || relation);
  $("#umlClassFields").hidden = !klass;
  $("#umlRelationFields").hidden = !relation;
  $("#umlDelete").disabled = !klass && (!relation || relation.auto);
  $("#umlExportNs").disabled = !umlState.classes.some((item) => item.kind !== "enum");
  if (klass) {
    const isEnum = klass.kind === "enum";
    $("#umlClassNameField").firstChild.textContent = isEnum ? "Nombre del enum " : "Nombre de la clase ";
    $("#umlLiteralsField").hidden = !isEnum;
    $("#umlAttributesField").hidden = isEnum;
    $("#umlMethodsField").hidden = isEnum;
    $("#umlClassHelp").hidden = isEnum;
    $("#umlEnumHelp").hidden = !isEnum;
    $("#umlClassName").value = klass.name;
    $("#umlLiterals").value = klass.literals || "";
    $("#umlAttributes").value = klass.attributes;
    $("#umlMethods").value = klass.methods;
  }
  if (relation) {
    $("#umlSelectedRelationType").value = relation.type;
    $("#umlSelectedRelationType").disabled = false;
    $("#umlRelationMultiplicityField").hidden = relation.type !== "association";
    $("#umlRelationMultiplicity").value = umlMultiplicity(relation);
    $("#umlRelationPropertyField").hidden = !attributes.length;
    if (relationChanged || document.activeElement !== $("#umlRelationProperty")) $("#umlRelationProperty").value = attributes.map((item) => item.name).join(", ");
    $("#umlRelationPropertyTypeField").hidden = !attributes.length;
    $("#umlRelationPropertyType").value = attributes.map((item) => item.type).join(", ");
    $("#umlRelationLabelField").hidden = Boolean(relation.auto);
    if (relationChanged || document.activeElement !== $("#umlRelationLabel")) $("#umlRelationLabel").value = relation.label;
  }
  $("#umlConnect").setAttribute("aria-pressed", umlConnecting);
  umlHintEl.textContent = umlConnecting
    ? umlConnectionStart ? "Elegí el segundo elemento." : "Elegí el primer elemento."
    : umlState.classes.length ? "Arrastrá los elementos para ordenarlos. Editá sus datos a la derecha." : "Agregá una clase o enum para empezar.";
}

function renderUml() {
  umlClassesEl.innerHTML = umlState.classes.map(umlClassHtml).join("");
  renderUmlLines();
  renderUmlSelection();
}

function umlSelect(kind, id) {
  umlSelected = { kind, id };
  renderUml();
}

function umlSaveChange() {
  renderUml();
  scheduleAutoSave();
}

function umlPromoteInferredRelation(inferred) {
  const relation = { id: umlNewId("relation"), from: inferred.from, to: inferred.to, type: inferred.type, multiplicity: "1", label: "", attributeIndex: inferred.attributeIndex };
  umlState.relations.push(relation);
  umlSelected = { kind: "relation", id: relation.id };
  return relation;
}

function umlUpdateClassField(field, value) {
  const item = umlState.classes.find((node) => node.id === umlSelected?.id);
  if (!item) return;
  item[field] = value;
  umlSaveChange();
}

$("#nsModeBtn").onclick = () => showEditorMode("ns");
$("#umlModeBtn").onclick = () => showEditorMode("uml");
$("#umlAddClass").onclick = () => {
  umlAddNode("class");
};
$("#umlAddEnum").onclick = () => {
  umlAddNode("enum");
};
function umlAddNode(kind) {
  const count = umlState.classes.length;
  const number = umlState.classes.filter((item) => item.kind === kind || (kind === "class" && !item.kind)).length + 1;
  const item = { id: umlNewId(kind), kind, name: `${kind === "enum" ? "Enum" : "Clase"}${number}`, attributes: "", methods: "", literals: "", x: 100 + (count % 4) * 260, y: 100 + Math.floor(count / 4) * 230, width: 220 };
  umlState.classes.push(item);
  umlSelect("class", item.id);
  scheduleAutoSave();
}
$("#umlConnect").onclick = () => {
  umlConnecting = !umlConnecting;
  umlConnectionStart = null;
  renderUmlSelection();
  umlClassesEl.querySelectorAll(".connecting").forEach((el) => el.classList.remove("connecting"));
};
$("#umlDelete").onclick = () => {
  if (!umlSelected) return;
  if (umlSelected.kind === "class") {
    umlState.classes = umlState.classes.filter((item) => item.id !== umlSelected.id);
    umlState.relations = umlState.relations.filter((item) => item.from !== umlSelected.id && item.to !== umlSelected.id);
  } else umlState.relations = umlState.relations.filter((item) => item.id !== umlSelected.id);
  umlSelected = null;
  umlConnectionStart = null;
  renderUml();
  scheduleAutoSave();
};
$("#umlClassName").oninput = (e) => umlUpdateClassField("name", e.target.value);
$("#umlLiterals").oninput = (e) => umlUpdateClassField("literals", e.target.value);
$("#umlAttributes").oninput = (e) => umlUpdateClassField("attributes", e.target.value);
$("#umlMethods").oninput = (e) => umlUpdateClassField("methods", e.target.value);
$("#umlSelectedRelationType").onchange = (e) => {
  const item = umlState.relations.find((relation) => relation.id === umlSelected?.id);
  if (item) { item.type = e.target.value; umlSaveChange(); return; }
  const inferred = umlInferredRelations().find((relation) => relation.id === umlSelected?.id);
  if (!inferred) return;
  const relation = umlPromoteInferredRelation(inferred);
  relation.type = e.target.value;
  umlSaveChange();
};
$("#umlRelationMultiplicity").onchange = (e) => {
  let item = umlState.relations.find((relation) => relation.id === umlSelected?.id);
  if (!item) {
    const inferred = umlInferredRelations().find((relation) => relation.id === umlSelected?.id);
    if (inferred) item = umlPromoteInferredRelation(inferred);
  }
  if (item && item.type === "association") {
    item.multiplicity = umlMultiplicity({ multiplicity: e.target.value });
    umlSaveChange();
  }
};
$("#umlRelationLabel").oninput = (e) => {
  const item = umlState.relations.find((relation) => relation.id === umlSelected?.id);
  if (item) { item.label = e.target.value; umlSaveChange(); }
};
$("#umlRelationProperty").oninput = (e) => {
  const relation = umlState.relations.find((item) => item.id === umlSelected?.id) || umlInferredRelations().find((item) => item.id === umlSelected?.id);
  if (!relation) return;
  const source = umlState.classes.find((item) => item.id === relation.from);
  const target = umlState.classes.find((item) => item.id === relation.to);
  if (!source || !target) return;
  const attributes = umlLinkedAttributes(relation, source, target);
  const names = e.target.value.split(",").map((name) => name.trim());
  if (names.length !== attributes.length || !names.every((name) => /^[A-Za-z_$][\w$]*$/.test(name))) return;
  const lines = umlMemberLines(source.attributes);
  attributes.forEach((attribute, index) => {
    lines[attribute.index] = lines[attribute.index].replace(/^([+\-#~]?\s*)[A-Za-z_$][\w$]*(\s*:)/, (_, prefix, suffix) => `${prefix}${names[index]}${suffix}`);
  });
  source.attributes = lines.join("\n");
  umlSaveChange();
};
$("#umlRelationProperty").onblur = renderUmlSelection;

umlCanvasEl.addEventListener("pointerdown", (event) => {
  const relation = event.target.closest("[data-uml-relation]");
  if (relation) { umlSelect("relation", relation.dataset.umlRelation); return; }
  const el = event.target.closest("[data-uml-class]");
  if (!el) { umlSelected = null; renderUml(); return; }
  const item = umlState.classes.find((node) => node.id === el.dataset.umlClass);
  if (!item) return;
  if (umlConnecting) {
    if (!umlConnectionStart) {
      umlConnectionStart = item.id;
      renderUmlSelection();
      el.classList.add("connecting");
    } else if (umlConnectionStart !== item.id) {
      const relation = { id: umlNewId("relation"), from: umlConnectionStart, to: item.id, type: $("#umlRelationType").value, multiplicity: "1", label: "" };
      umlState.relations.push(relation);
      umlConnectionStart = null;
      umlConnecting = false;
      umlSelect("relation", relation.id);
      scheduleAutoSave();
    }
    return;
  }
  if (umlSelected?.id !== item.id || umlSelected.kind !== "class") {
    umlSelected = { kind: "class", id: item.id };
    umlClassesEl.querySelectorAll(".selected").forEach((node) => node.classList.remove("selected"));
    el.classList.add("selected");
    renderUmlLines();
    renderUmlSelection();
  }
  const box = el;
  const resize = Boolean(event.target.closest(".uml-resize"));
  const startX = event.clientX, startY = event.clientY, originalX = item.x, originalY = item.y, originalWidth = item.width;
  box.setPointerCapture(event.pointerId);
  box.onpointermove = (move) => {
    if (!box.hasPointerCapture(move.pointerId)) return;
    if (resize) { item.width = Math.max(170, Math.min(400, originalWidth + move.clientX - startX)); box.style.width = `${item.width}px`; }
    else { item.x = Math.max(0, Math.min(1400, originalX + move.clientX - startX)); item.y = Math.max(0, Math.min(900, originalY + move.clientY - startY)); box.style.left = `${item.x}px`; box.style.top = `${item.y}px`; }
    renderUmlLines();
  };
  box.onpointerup = () => { box.onpointermove = null; box.onpointerup = null; scheduleAutoSave(); };
  box.onpointercancel = box.onpointerup;
});

document.addEventListener("keydown", (event) => {
  if (editorMode !== "uml" || !umlSelected || !["Delete", "Backspace"].includes(event.key)) return;
  if (event.target.closest("input, textarea, select, [contenteditable]")) return;
  event.preventDefault();
  $("#umlDelete").click();
});

function umlExportSvg() {
  const classSvg = umlState.classes.map((item) => {
    const isEnum = item.kind === "enum";
    const attrs = isEnum ? umlMemberLines(item.literals) : umlVisibleAttributes(item);
    const methods = isEnum ? [] : umlMemberLines(item.methods);
    const height = umlClassHeight(item), y1 = item.y + (isEnum ? 58 : 40), y2 = y1 + Math.max(28, attrs.length * 22 + 12);
    const text = (lines, startY) => lines.map((line, index) => `<text x="${item.x + 12}" y="${startY + index * 22}" font-size="14" fill="#263247">${esc(line)}</text>`).join("");
    const title = isEnum
      ? `<text x="${item.x + item.width / 2}" y="${item.y + 19}" text-anchor="middle" font-size="12" fill="#263247">«enum»</text><text x="${item.x + item.width / 2}" y="${item.y + 41}" text-anchor="middle" font-size="16" font-weight="bold" fill="#263247">${esc(item.name)}</text>`
      : `<text x="${item.x + item.width / 2}" y="${item.y + 26}" text-anchor="middle" font-size="16" font-weight="bold" fill="#263247">${esc(item.name)}</text>`;
    return `<g><rect x="${item.x}" y="${item.y}" width="${item.width}" height="${height}" fill="#fff" stroke="#364152" stroke-width="2"/><line x1="${item.x}" y1="${y1}" x2="${item.x + item.width}" y2="${y1}" stroke="#364152"/>${isEnum ? "" : `<line x1="${item.x}" y1="${y2}" x2="${item.x + item.width}" y2="${y2}" stroke="#364152"/>`}${title}${text(attrs, y1 + 21)}${text(methods, y2 + 21)}</g>`;
  }).join("");
  const relations = [...umlInferredRelations(), ...umlState.relations].map((item) => umlRelationSvg(item, false)).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000"><style>:root{--uml-paper:#fff;--uml-ink:#364152;--uml-auto-ink:#3858d6}.uml-stroke{stroke:#364152;stroke-width:2;fill:none}.uml-auto .uml-stroke{stroke:#3858d6}.uml-line-label{font:13px Arial;fill:#263247;paint-order:stroke;stroke:#fff;stroke-width:5px}.uml-property-label,.uml-multiplicity{font-size:12px}.uml-multiplicity{font-weight:bold}.uml-auto .uml-line-label{fill:#3858d6}</style><rect width="1600" height="1000" fill="white"/>${umlMarkers()}${relations}${classSvg}</svg>`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  a.download = `${(projectName.value || "diagrama").replace(/[^a-z0-9_-]+/gi, "-")}-uml.svg`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$("#umlExport").onclick = umlExportSvg;

function umlSplitParameters(value) {
  // Las comas dentro de genéricos o agrupaciones no separan parámetros.
  const parts = [];
  let depth = 0, start = 0;
  for (let index = 0; index < value.length; index++) {
    if ("<([{".includes(value[index])) depth++;
    else if (">)]}".includes(value[index])) depth = Math.max(0, depth - 1);
    else if (value[index] === "," && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

function umlNsAttribute(line) {
  const match = line.match(/^[+\-#~]?\s*([A-Za-z_$][\w$]*)\s*:\s*(.+?)(?:\s*=\s*(.+))?$/);
  if (!match) return null;
  const [, name, rawType, rawValue] = match;
  const dataType = rawType.trim();
  if (!dataType) return null;
  return { kind: rawValue === undefined ? "variable" : "declare", dataType, name, expression: rawValue?.trim() || "", umlGenerated: true };
}

function umlNsMethod(line, className) {
  const match = line.match(/^([+\-#~])?\s*(?:(static)\s+)?(?:(\S+)\s+)?([A-Za-z_$][\w$]*)\s*\((.*)\)\s*(?::\s*(.+))?$/);
  if (!match) return null;
  const [, visibility, staticWord, prefixType, name, rawParameters, suffixType] = match;
  const parameters = [];
  for (const part of umlSplitParameters(rawParameters)) {
    const colon = part.match(/^([A-Za-z_$][\w$]*)\s*:\s*(.+)$/);
    const typeFirst = part.match(/^(.+)\s+([A-Za-z_$][\w$]*)$/);
    const dataType = (colon?.[2] || typeFirst?.[1] || "Object").trim();
    const parameterName = colon?.[1] || typeFirst?.[2] || part;
    if (!/^[A-Za-z_$][\w$]*$/.test(parameterName) || !dataType) return null;
    parameters.push({ kind: "parameter", dataType, name: parameterName, expression: "", umlGenerated: true });
  }
  const modifier = ({ "+": "public", "-": "private", "#": "protected", "~": "package" })[visibility] || "public";
  return {
    method: { className, modifiers: `${modifier}${staticWord ? " static" : ""}`, returnType: (suffixType || prefixType || "void").trim(), name },
    parameters,
  };
}

function umlNsBlueprints() {
  // Se valida todo antes de pedir confirmación: un miembro inválido nunca debe
  // provocar un reemplazo parcial de los diagramas NS# existentes.
  const items = [], errors = [], seenNames = new Set(), classFields = Object.create(null);
  umlState.classes.forEach((klass) => {
    const className = klass.name.trim();
    if (!className || seenNames.has(className)) {
      errors.push(`Nombre de elemento vacío o repetido: ${className || "(vacío)"}`);
      return;
    }
    seenNames.add(className);
    if (klass.kind === "enum") return;
    const attributes = umlMemberLines(klass.attributes).map((line) => {
      const result = umlNsAttribute(line);
      if (!result) errors.push(`${className}: atributo «${line}»`);
      return result;
    }).filter(Boolean);
    classFields[className] = attributes.map(({ umlGenerated, ...item }) => item);
    const methodLines = umlMemberLines(klass.methods);
    const methods = methodLines.length ? methodLines.map((line) => {
      const result = umlNsMethod(line, className);
      if (!result) errors.push(`${className}: método «${line}»`);
      return result;
    }) : [{ method: { className, modifiers: "public", returnType: "void", name: "main" }, parameters: [] }];
    methods.forEach((parsed, methodIndex) => {
      if (!parsed) return;
      items.push({
        umlSource: { classId: klass.id, methodIndex: methodLines.length ? methodIndex : -1 },
        method: parsed.method,
        declarations: parsed.parameters,
      });
    });
  });
  return { items, errors, classFields };
}

let pendingUmlExport = null;
const umlExportNsDialog = $("#umlExportNsDialog");

function umlReplaceNsFromUml(items, fields) {
  // La exportación reemplaza todos los métodos NS# y deja UML disponible para
  // seguir editándolo; sólo se llama después de confirmar en el diálogo.
  stop();
  nextId = 1;
  nextDiagramId = items.length + 1;
  classDeclarations = normalizeClassDeclarations(fields);
  diagrams = items.map((item, index) => ({
    id: `diagram-${index + 1}`,
    blocks: [],
    declarations: item.declarations,
    method: item.method,
    umlSource: item.umlSource,
  }));
  const first = diagrams[0];
  activeDiagramId = first.id;
  blocks = first.blocks;
  declarations = first.declarations;
  method = first.method;
  selectedId = null;
  showEditorMode("ns");
  render();
  diagramsPanel.classList.add("open");
  saveLocalProject(false);
  toast(`${diagrams.length} método(s) generados en NS#`);
}

function umlExportToNs() {
  if (!umlState.classes.some((item) => item.kind !== "enum")) return;
  const { items, errors, classFields } = umlNsBlueprints();
  if (errors.length) {
    umlHintEl.textContent = `Revisá ${errors[0]}`;
    toast("Corregí los datos UML antes de exportar");
    return;
  }
  pendingUmlExport = { items, classFields };
  umlExportNsDialog.returnValue = "";
  umlExportNsDialog.showModal();
}
$("#umlExportNs").onclick = umlExportToNs;
umlExportNsDialog.addEventListener("close", () => {
  const exportData = pendingUmlExport;
  pendingUmlExport = null;
  if (umlExportNsDialog.returnValue === "replace" && exportData) umlReplaceNsFromUml(exportData.items, exportData.classFields);
});

showEditorMode(editorMode);
