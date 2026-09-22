// Guardado local, restauración y arranque de la aplicación.
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
    version: 2,
    savedAt: new Date().toISOString(),
    name: projectName.value,
    diagrams,
    activeDiagramId,
    meta: projectMeta,
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
    if (!savedProject?.diagrams && !savedProject?.blocks) {
      if (showMessage) toast("No hay una copia local para restaurar");
      updateAutoSaveStatus();
      return false;
    }

    stop();
    useDiagrams(savedProject.diagrams || [{ id: "diagram-1", blocks: savedProject.blocks, declarations: savedProject.declarations || [], method: savedProject.method || method }], savedProject.activeDiagramId);
    projectName.value = savedProject.name || "Proyecto sin título";
    projectMeta = readNsPlusMeta(savedProject.meta);
    colorToggle.checked = savedProject.colors !== false;
    darkToggle.checked = Boolean(savedProject.darkTheme);
    document.body.classList.toggle("dark-theme", darkToggle.checked);
    localStorage.setItem("ns-theme", darkToggle.checked ? "dark" : "light");
    applyInterface(savedProject.interface !== "classic");
    nextId = Math.max(0, ...diagrams.flatMap((item) => allBlocks(item.blocks).map((block) => Number(block.id) || 0))) + 1;
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
