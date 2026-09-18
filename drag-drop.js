// Arrastrar, soltar, reubicar y eliminar bloques.
function includesBlock(block, id) {
  if (!block) return false;
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
  if (dragged) return dragged;
  try {
    const data =
      event.dataTransfer.getData(DRAG_TYPE) ||
      event.dataTransfer.getData("text/plain");
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}
function beginDrag(event, payload, effectAllowed) {
  dragged = payload;
  const data = JSON.stringify(payload);
  event.dataTransfer.effectAllowed = effectAllowed;
  // text/plain is needed as a compatibility format by Chromium-based browsers.
  event.dataTransfer.setData(DRAG_TYPE, data);
  event.dataTransfer.setData("text/plain", data);
}
function allowDrop(event, effect) {
  event.preventDefault();
  event.dataTransfer.dropEffect = effect;
}
function leftDropTarget(event, element) {
  return !element.contains(event.relatedTarget);
}
function canDropInContainer(payload, container) {
  if (!payload) return false;
  if (payload.origin !== "diagram") return payload.origin === "palette";
  const [parentId] = container.dataset.container.split(":");
  // A block cannot be inserted in itself or in one of its descendants.
  return !includesBlock(find(payload.id), Number(parentId));
}
function canDropByBlock(payload, targetId) {
  return (
    !!payload &&
    (payload.origin !== "diagram" ||
      (payload.id !== targetId && !includesBlock(find(payload.id), targetId)))
  );
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
      beginDrag(e, { origin: "palette", type: el.dataset.add }, "copy");
      el.classList.add("dragging");
    };
    el.ondragend = () => {
      el.classList.remove("dragging");
      finishDrop();
    };
  });
  $$(".ns-block").forEach((el) => {
    // Chrome is inconsistent when a draggable ancestor contains editable
    // text. A dedicated handle avoids competing with contenteditable and
    // also makes it clear where a block can be picked up.
    el.draggable = true;
    el.title = "Arrastrá para mover";
    const handle = document.createElement("span");
    handle.className = "drag-handle";
    handle.draggable = true;
    handle.setAttribute("role", "img");
    handle.setAttribute("aria-label", "Arrastrar bloque");
    handle.title = "Arrastrá para mover";
    handle.textContent = "⠿";
    el.prepend(handle);
    handle.ondragstart = (e) => {
      e.stopPropagation();
      beginDrag(e, { origin: "diagram", id: Number(el.dataset.id) }, "move");
      setTimeout(() => el.classList.add("dragging"), 0);
    };
    handle.ondragend = (e) => {
      e.stopPropagation();
      el.classList.remove("dragging");
      finishDrop();
    };
    el.ondragstart = (e) => {
      if (e.target.closest(".editable") || e.target.closest("[data-switch-action]")) {
        e.preventDefault();
        return;
      }
      // Los bloques anidados también viven dentro de un .ns-block. Sin cortar
      // la propagación, el padre reemplaza este payload y se mueve/elimina el
      // contenedor entero en lugar del bloque que se tomó.
      e.stopPropagation();
      beginDrag(e, { origin: "diagram", id: Number(el.dataset.id) }, "move");
      setTimeout(() => el.classList.add("dragging"), 0);
    };
    el.ondragend = () => {
      el.classList.remove("dragging");
      finishDrop();
    };
    el.ondragover = (e) => {
      const payload = dragPayload(e);
      if (!canDropByBlock(payload, Number(el.dataset.id))) return;
      allowDrop(e, dragged?.origin === "palette" ? "copy" : "move");
      e.stopPropagation();
      const top =
        e.clientY < el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2;
      el.classList.toggle("drop-before", top);
      el.classList.toggle("drop-after", !top);
    };
    el.ondragleave = (e) => {
      if (leftDropTarget(e, el))
        el.classList.remove("drop-before", "drop-after");
    };
    el.ondrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const p = dragPayload(e),
        targetId = Number(el.dataset.id);
      if (!canDropByBlock(p, targetId)) return finishDrop();
      const before =
          e.clientY < el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2,
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
      const payload = dragPayload(e);
      if (!canDropInContainer(payload, el)) return;
      allowDrop(e, dragged?.origin === "palette" ? "copy" : "move");
      e.stopPropagation();
      el.classList.add("drop-inside");
    };
    el.ondragleave = (e) => {
      if (leftDropTarget(e, el)) el.classList.remove("drop-inside");
    };
    el.ondrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const p = dragPayload(e);
      if (!canDropInContainer(p, el)) return finishDrop();
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
    if (e.target === diagram && dragPayload(e)) {
      allowDrop(e, dragged?.origin === "palette" ? "copy" : "move");
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

  // El cesto acepta solamente bloques que ya pertenecen al diagrama. Así,
  // arrastrar desde la paleta hacia él nunca elimina ni crea un bloque.
  trashDropZone.ondragover = (e) => {
    if (dragPayload(e)?.origin !== "diagram") return;
    allowDrop(e, "move");
    trashDropZone.classList.add("drag-over");
  };
  trashDropZone.ondragleave = (e) => {
    if (leftDropTarget(e, trashDropZone))
      trashDropZone.classList.remove("drag-over");
  };
  trashDropZone.ondrop = (e) => {
    e.preventDefault();
    const payload = dragPayload(e);
    trashDropZone.classList.remove("drag-over");
    if (payload?.origin !== "diagram") return finishDrop();

    const removed = removeDragged(payload);
    if (removed) {
      selectedId = null;
      toast("Bloque eliminado");
      render();
    }
    finishDrop();
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
const consoleSize = $("#consoleSize");
const consoleSizeLabel = $("#consoleSizeLabel");
const setConsoleSize = () => {
  // El panel crece desde abajo; la salida conserva el scroll dentro de sí misma.
  runtimePanel.style.height = `${Number(consoleSize.value) + 190}px`;
  consoleSizeLabel.textContent = `${consoleSize.value} px`;
};
consoleSize.oninput = setConsoleSize;
setConsoleSize();
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
