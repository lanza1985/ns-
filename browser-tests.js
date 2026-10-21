// Pruebas sin dependencias. Los casos de integración restauran el proyecto abierto.
(() => {
  const dialog = document.querySelector("#browserTestsDialog");
  const summary = document.querySelector("#browserTestsSummary");
  const results = document.querySelector("#browserTestsResults");

  function equal(actual, expected) {
    if (!Object.is(actual, expected))
      throw Error(`Se esperaba ${JSON.stringify(expected)}; se recibió ${JSON.stringify(actual)}`);
  }

  function check(condition, message) {
    if (!condition) throw Error(message);
  }

  const fixtureMethod = (name = "main") => ({ className: "Prueba", modifiers: "public", returnType: "void", name });
  const fixtureDiagram = (items = [], declarations = [], name = "main") => ({
    id: `test-${name}`, blocks: items, declarations, method: fixtureMethod(name),
  });

  async function withTemporaryProject(test) {
    if (pendingInput) throw Error("Terminá la entrada pendiente antes de ejecutar las pruebas");
    const saved = {
      diagrams, activeDiagramId, classDeclarations, umlState, editorMode, projectMeta,
      nextId, nextDiagramId, selectedId, runner, dragged,
      hadAutoSave: autoSaveTimer !== null,
      name: projectName.value,
      storage: localStorage.getItem(LOCAL_STORAGE_KEY),
      theme: localStorage.getItem("ns-theme"),
      consoleHtml: document.querySelector("#console").innerHTML,
      status: status.textContent,
      statusClass: status.className,
      toastText: toastEl.textContent,
      toastClass: toastEl.className,
      runtimeOpen: runtimePanel.classList.contains("open"),
      blocksOpen: blocksPanel.classList.contains("open"),
      diagramsOpen: diagramsPanel.classList.contains("open"),
    };
    clearTimeout(timer);
    clearTimeout(autoSaveTimer);
    timer = null;
    runner = null;
    dragged = null;
    try {
      useDiagrams([fixtureDiagram()]);
      classDeclarations = Object.create(null);
      umlState = { classes: [], relations: [], nextId: 1 };
      editorMode = "ns";
      projectMeta = [];
      projectName.value = "Prueba temporal";
      nextId = 1000;
      selectedId = null;
      render();
      await test();
    } finally {
      clearTimeout(timer);
      clearTimeout(autoSaveTimer);
      timer = null;
      autoSaveTimer = null;
      useDiagrams(saved.diagrams, saved.activeDiagramId);
      classDeclarations = saved.classDeclarations;
      umlState = saved.umlState;
      editorMode = saved.editorMode;
      projectMeta = saved.projectMeta;
      nextId = saved.nextId;
      nextDiagramId = saved.nextDiagramId;
      selectedId = saved.selectedId;
      runner = saved.runner;
      dragged = saved.dragged;
      projectName.value = saved.name;
      if (saved.storage === null) localStorage.removeItem(LOCAL_STORAGE_KEY);
      else localStorage.setItem(LOCAL_STORAGE_KEY, saved.storage);
      if (saved.theme === null) localStorage.removeItem("ns-theme");
      else localStorage.setItem("ns-theme", saved.theme);
      updateAutoSaveStatus();
      showEditorMode(editorMode);
      render();
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
      document.querySelector("#console").innerHTML = saved.consoleHtml;
      status.textContent = saved.status;
      status.className = saved.statusClass;
      toastEl.textContent = saved.toastText;
      toastEl.className = saved.toastClass;
      runtimePanel.classList.toggle("open", saved.runtimeOpen);
      blocksPanel.classList.toggle("open", saved.blocksOpen);
      diagramsPanel.classList.toggle("open", saved.diagramsOpen);
      if (runner?.auto && !runner.done) timer = setTimeout(advance, Number(speed.value));
      if (saved.hadAutoSave) scheduleAutoSave();
    }
  }

  const cases = [
    ["Base64 conserva caracteres UTF-8", () => {
      equal(base64ToUtf8(utf8ToBase64("áéí ñ 😀")), "áéí ñ 😀");
    }],
    ["El texto de un bloque se escapa para HTML", () => {
      equal(esc('<script>"&'), "&lt;script&gt;&quot;&amp;");
      check(inputHtml('"<').includes('value="&quot;&lt;"'), "El valor del input no se escapó");
    }],
    ["El contexto del examen lee los parámetros de la URL", () => {
      const start = "2026-09-22T17:00:00Z";
      const context = parseExamContextFromUrl(`?k=${encodeURIComponent(utf8ToBase64(start))}&k2=${encodeURIComponent(utf8ToBase64("2026-09-22T19:00:00Z"))}&usuario=Ana&curso=A`);
      equal(context.user, "Ana");
      equal(context.course, "A");
      equal(context.start.toISOString(), "2026-09-22T17:00:00.000Z");
      check(isExamActive(new Date(start), context), "El inicio debe estar incluido");
      check(isExamActive(new Date("2026-09-22T19:00:00Z"), context), "El final debe estar incluido");
      check(!isExamActive(new Date("2026-09-22T19:00:01Z"), context), "El tiempo posterior debe quedar fuera");
    }],
    ["Las fechas de examen inválidas se descartan", () => {
      equal(parseExamDate("%%%"), null);
      equal(parseExamDate(utf8ToBase64("fecha inválida")), null);
    }],
    ["El estado UML elimina relaciones huérfanas y limita posiciones", () => {
      const state = normalizeUmlState({
        classes: [{ id: "a", name: "A", x: -20, y: 10000, width: 20 }, { id: "b", name: "B" }],
        relations: [{ id: "ok", from: "a", to: "b", type: "inheritance" }, { id: "bad", from: "a", to: "missing" }],
      });
      equal(state.classes[0].x, 0);
      equal(state.classes[0].y, 900);
      equal(state.classes[0].width, 170);
      equal(state.relations.length, 1);
      equal(state.relations[0].type, "inheritance");
    }],
    ["Las declaraciones de clase omiten entradas inválidas", () => {
      const normalized = normalizeClassDeclarations({ A: [{ kind: "constant", name: "PI", dataType: "Number", expression: "3.14" }, null, { name: "x", kind: "unknown" }] });
      equal(normalized.A.length, 2);
      equal(normalized.A[0].kind, "constant");
      equal(normalized.A[1].kind, "variable");
    }],
    ["El compilador enlaza las ramas de una condición", () => {
      const steps = compile([{ type: "if", condition: "true", then: [{ type: "output", expression: "1" }], else: [{ type: "output", expression: "2" }] }]);
      equal(steps.map((step) => step.kind).join(","), "if,output,jump,output");
      equal(steps[0].no, 3);
      equal(steps[2].to, 4);
    }],
    ["El compilador enlaza la salida de un bucle", () => {
      const steps = compile([{ type: "while", condition: "false", body: [{ type: "instruction", code: "x = 1" }] }]);
      equal(steps.map((step) => step.kind).join(","), "while,instruction,jump");
      equal(steps[0].end, 3);
      equal(steps[2].to, 0);
    }],
    ["Las llamadas a métodos reconocen resultado y argumentos", () => {
      const match = parseDiagramCall("total = Math.sum(1, 2)");
      check(match, "No se reconoció la llamada");
      equal(match[1], "total");
      equal(match[2], "Math");
      equal(match[3], "sum");
      equal(match[4], "1, 2");
      equal(parseDiagramCall("texto libre"), null);
    }],
    ["Guardar y abrir .nsplus conserva diagramas, bloques y metadatos", () => withTemporaryProject(() => {
      useDiagrams([
        fixtureDiagram([{ id: 1000, type: "output", expression: '"Hola"' }]),
        fixtureDiagram([{ id: 1001, type: "return", expression: "7" }], [], "otro"),
      ], "test-otro");
      classDeclarations = normalizeClassDeclarations({ Prueba: [{ kind: "variable", dataType: "Integer", name: "contador" }] });
      projectMeta = [{ d: "2026-01-01T00:00:00.000Z", i: { usr: "Anterior" } }];
      const file = createNsPlusFile();
      useDiagrams([fixtureDiagram()]);
      projectMeta = [];
      loadProjectFile(file);
      equal(diagrams.length, 2);
      equal(activeDiagramId, "test-otro");
      equal(diagrams[0].blocks[0].expression, '"Hola"');
      equal(diagrams[1].blocks[0].expression, "7");
      equal(classDeclarations.Prueba[0].name, "contador");
      equal(projectMeta[0].i.usr, "Anterior");
      equal(projectMeta.length, 2);
    })],
    ["Ejecutar un diagrama resuelve asignación, condición, bucle y método", () => withTemporaryProject(async () => {
      useDiagrams([fixtureDiagram([
        { id: 1000, type: "instruction", code: "total = 0" },
        { id: 1001, type: "for", variable: "i", start: "1", end: "3", step: "1", body: [
          { id: 1002, type: "instruction", code: "total = total + i" },
        ] },
        { id: 1003, type: "if", condition: "total == 6", then: [
          { id: 1004, type: "output", expression: '"correcto"' },
        ], else: [{ id: 1005, type: "output", expression: '"incorrecto"' }] },
        { id: 1006, type: "call", code: "doble = Prueba.duplicar(total)" },
      ]), fixtureDiagram([{ id: 1007, type: "return", expression: "n * 2" }], [
        { kind: "parameter", dataType: "Integer", name: "n", expression: "" },
      ], "duplicar")], "test-main");
      start(false);
      for (let count = 0; runner && !runner.done && count < 30; count++) await advance();
      check(runner?.done, "El programa no finalizó");
      equal(runner.vars.total, 6);
      equal(runner.vars.doble, 12);
      check(document.querySelector("#console").textContent.includes("correcto"), "No salió la rama verdadera");
      check(!document.querySelector("#console").textContent.includes("incorrecto"), "Salió la rama incorrecta");
    })],
    ["Las variables de clase comparten estado y permiten objetos", () => withTemporaryProject(async () => {
      useDiagrams([
        fixtureDiagram([
          { id: 1000, type: "call", code: "Prueba.incrementar()" },
          { id: 1001, type: "call", code: "Prueba.incrementar()" },
          { id: 1002, type: "instruction", code: "otra = new Prueba()" },
          { id: 1003, type: "instruction", code: "otra.contador = 9" },
          { id: 1004, type: "call", code: "otra.incrementar()" },
          { id: 1005, type: "output", expression: "contador" },
        ]),
        fixtureDiagram([
          { id: 1006, type: "instruction", code: "contador = contador + 1" },
          { id: 1007, type: "return", expression: "contador" },
        ], [], "incrementar"),
      ]);
      classDeclarations = normalizeClassDeclarations({ Prueba: [{ kind: "declare", dataType: "Integer", name: "contador", expression: "0" }] });
      render();
      await start(false);
      for (let count = 0; runner && !runner.done && count < 20; count++) await advance();
      check(runner?.done, "El programa no finalizó");
      equal(runner.vars.contador, 2);
      equal(runner.vars.otra.contador, 10);
    })],
    ["ArrayList admite genéricos, métodos y PARA CADA", () => withTemporaryProject(async () => {
      useDiagrams([fixtureDiagram([
        { id: 1000, type: "call", code: 'nombres.add("Ana")' },
        { id: 1001, type: "call", code: 'nombres.add("Luis")' },
        { id: 1002, type: "instruction", code: 'primero = nombres.get(0)' },
        { id: 1003, type: "foreach", dataType: "String", variable: "nombre", collection: "nombres", body: [
          { id: 1004, type: "output", expression: "nombre" },
        ] },
        { id: 1005, type: "call", code: 'nombres.set(1, "Lu")' },
        { id: 1006, type: "output", expression: "nombres.size()" },
        { id: 1007, type: "instruction", code: "otraLista = new ArrayList<String>()" },
        { id: 1008, type: "call", code: 'otraLista.add("X")' },
      ])]);
      classDeclarations = normalizeClassDeclarations({ Prueba: [{ kind: "declare", dataType: "ArrayList<String>", name: "nombres", expression: "new ArrayList<>()" }] });
      render();
      equal(callValidationError('nombres.add("Ana")'), "");
      equal(callValidationError('otraLista.add("X")'), "");
      await start(false);
      for (let count = 0; runner && !runner.done && count < 25; count++) await advance();
      check(runner?.done, "El programa no finalizó");
      check(status.textContent !== "Error", document.querySelector("#console").textContent);
      equal(runner.vars.primero, "Ana");
      equal(runner.vars.nombres.get(1), "Lu");
      equal(runner.vars.nombres.size(), 2);
      equal(runner.vars.otraLista.get(0), "X");
      check(runner.vars.nombres.contains("Lu"), "contains no encontró el elemento");
      equal(runner.vars.nombres.remove(0), "Ana");
      equal(runner.vars.nombres.size(), 1);
      runner.vars.nombres.clear();
      check(runner.vars.nombres.isEmpty(), "clear no vació la lista");
      check(document.querySelector("#console").textContent.includes("Ana"), "PARA CADA no recorrió la lista");
    })],
    ["Autoguardado restaura el proyecto y su nombre", () => withTemporaryProject(() => {
      useDiagrams([fixtureDiagram([{ id: 1000, type: "comment", text: "copia" }])]);
      projectName.value = "Proyecto recuperable";
      saveLocalProject(false);
      useDiagrams([fixtureDiagram()]);
      projectName.value = "Otro nombre";
      check(restoreLocalProject(false), "No se restauró la copia");
      equal(projectName.value, "Proyecto recuperable");
      equal(blocks[0].text, "copia");
    })],
    ["UML genera métodos, parámetros y variables de clase", () => withTemporaryProject(() => {
      umlState = normalizeUmlState({ classes: [{
        id: "uml-1", name: "Persona", attributes: "+ edad: Integer = 18",
        methods: "+ saludar(nombre: String): String", x: 0, y: 0,
      }] });
      const blueprint = umlNsBlueprints();
      equal(blueprint.errors.length, 0);
      umlReplaceNsFromUml(blueprint.items, blueprint.classFields);
      equal(diagrams.length, 1);
      equal(diagrams[0].method.className, "Persona");
      equal(diagrams[0].method.name, "saludar");
      equal(diagrams[0].declarations[0].name, "nombre");
      equal(classDeclarations.Persona[0].expression, "18");
    })],
    ["UML subraya nombres de atributos sin cambiar su nombre de NS#", () => withTemporaryProject(() => {
      umlState = normalizeUmlState({ classes: [
        { id: "a", name: "Persona", attributes: "+ _edad_: Integer\n+ _cliente_: Cliente\n+ _nota_: String", methods: "+ _guardar_(): void" },
        { id: "b", name: "Cliente" },
      ] });
      const html = umlClassHtml(umlState.classes[0]);
      check(html.includes('<span class="uml-underlined-attribute">edad</span>'), "El atributo visible no se subrayó");
      check(html.includes("+ _guardar_(): void"), "El formato se aplicó a un método");
      const relation = umlInferredRelations()[0];
      equal(relation.label, "cliente");
      showEditorMode("uml");
      const relationSvg = umlRelationSvg(relation);
      check(relationSvg.includes('<tspan text-decoration="underline">cliente</tspan>'), "La relación no subrayó el nombre");
      check(!relationSvg.includes(": Cliente"), "La relación mostró el tipo del atributo");
      const manualSvg = umlRelationSvg({ ...relation, id: "manual", auto: false, label: "" });
      check(manualSvg.includes('<tspan text-decoration="underline">cliente</tspan>') && !manualSvg.includes(": Cliente"), "La relación manual mostró el tipo del atributo");
      const blueprint = umlNsBlueprints();
      equal(blueprint.classFields.Persona[0].name, "edad");
      equal(blueprint.classFields.Persona[1].name, "cliente");
      equal(umlAttributeText("+ _nota_: String", true), '+ <tspan text-decoration="underline">nota</tspan>: String');
      equal(umlAttributeText("+ _pendiente: String"), "+ _pendiente: String");
    })],
    ["Los controles agregan, mueven y eliminan un bloque", () => withTemporaryProject(() => {
      useDiagrams([fixtureDiagram([{ id: 1000, type: "comment", text: "primero" }])]);
      nextId = 1001;
      selectedId = 1000;
      render();
      document.querySelector('[data-add="instruction"]').click();
      equal(blocks.length, 2);
      const addedId = blocks[1].id;
      moveUp.click();
      equal(blocks[0].id, addedId);
      const transfer = new DataTransfer();
      transfer.setData(DRAG_TYPE, JSON.stringify({ origin: "diagram", id: addedId, diagramId: activeDiagramId }));
      trashDropZone.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: transfer }));
      equal(blocks.length, 1);
      equal(blocks[0].id, 1000);
    })],
  ];

  async function runTests() {
    results.replaceChildren();
    document.querySelector("#browserTestsRerun").disabled = true;
    let passed = 0;
    for (const [name, test] of cases) {
      const item = document.createElement("li");
      try {
        await test();
        passed++;
        item.className = "passed";
        item.textContent = `✓ ${name}`;
      } catch (error) {
        item.className = "failed";
        item.textContent = `✗ ${name}: ${error.message}`;
      }
      results.append(item);
    }
    summary.textContent = `${passed} de ${cases.length} pruebas correctas`;
    summary.className = passed === cases.length ? "passed" : "failed";
    document.querySelector("#browserTestsRerun").disabled = false;
  }

  document.querySelector("#browserTestsBtn").addEventListener("click", () => {
    dialog.showModal();
    runTests();
  });
  document.querySelector("#browserTestsRerun").addEventListener("click", runTests);
  document.querySelector("#browserTestsClose").addEventListener("click", () => dialog.close());
})();
