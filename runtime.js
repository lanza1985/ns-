// Intérprete y controles de ejecución del diagrama.
// Devuelve una lista plana para calcular IDs y números de línea.
const allBlocks = (source) => {
  const result = [];
  walk(source, (block) => {
    result.push(block);
    return false;
  });
  return result;
};
const all = () => allBlocks(blocks);

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
        if (Array.isArray(b.default)) add(b.default);
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
// Los nombres importados desde .nsplus son texto libre. No todos pueden usarse
// como parámetros de Function (por ejemplo, "total anual" o "class").
const JS_IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const JS_RESERVED_WORDS = new Set([
  "await", "break", "case", "catch", "class", "const", "continue", "debugger",
  "default", "delete", "do", "else", "enum", "export", "extends", "false",
  "finally", "for", "function", "if", "implements", "import", "in", "instanceof",
  "interface", "let", "new", "null", "package", "private", "protected", "public",
  "return", "super", "switch", "static", "this", "throw", "true", "try", "typeof",
  "undefined", "var", "void", "while", "with", "yield", "arguments", "eval",
]);

function expr(x) {
  // Evalúa una expresión usando solamente las variables válidas del programa.
  // Así, un nombre inválido que no participa en esta expresión no bloquea toda
  // la ejecución del diagrama importado.
  const entries = Object.entries(runner.vars).filter(
    ([name]) => JS_IDENTIFIER.test(name) && !JS_RESERVED_WORDS.has(name),
  );
  return Function(
    ...entries.map(([name]) => name),
    `"use strict";return (${String(x ?? "")})`,
  )(...entries.map(([, value]) => value));
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

function evaluateWith(vars, source) {
  const entries = Object.entries(vars).filter(
    ([name]) => JS_IDENTIFIER.test(name) && !JS_RESERVED_WORDS.has(name),
  );
  return Function(...entries.map(([name]) => name), `"use strict";return (${String(source ?? "")})`)(...entries.map(([, value]) => value));
}

function splitArguments(source) {
  if (!source.trim()) return [];
  let depth = 0, quote = "", start = 0, result = [];
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quote) { if (char === quote && source[index - 1] !== "\\") quote = ""; continue; }
    if (char === '"' || char === "'") quote = char;
    else if (char === "(" || char === "[" || char === "{") depth++;
    else if (char === ")" || char === "]" || char === "}") depth--;
    else if (char === "," && depth === 0) { result.push(source.slice(start, index)); start = index + 1; }
  }
  result.push(source.slice(start));
  return result;
}

function caretOffset(element) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !element.contains(selection.anchorNode)) return element.textContent.length;
  const range = selection.getRangeAt(0).cloneRange();
  range.selectNodeContents(element);
  range.setEnd(selection.anchorNode, selection.anchorOffset);
  return range.toString().length;
}

function setCaretOffset(element, offset) {
  const range = document.createRange();
  const text = element.firstChild || element.appendChild(document.createTextNode(""));
  range.setStart(text, Math.min(offset, text.textContent.length));
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function callParameters(item) {
  return item.declarations
    .filter((declaration) => declaration.kind === "parameter")
    .map((declaration) => `${declaration.dataType} ${declaration.name}`)
    .join(", ");
}

function callSuggestionsFor(code, offset) {
  const before = code.slice(0, offset);
  const classMatch = before.match(/^\s*(?:[A-Za-z_$][\w$]*\s*(?:=|←)\s*)?([A-Za-z_$][\w$]*)?$/);
  if (classMatch) {
    const fragment = classMatch[1] || "";
    const classes = [...new Set(diagrams.map((item) => String(item.method.className ?? "").trim()).filter(Boolean))];
    return classes
      .filter((name) => name.toLowerCase().startsWith(fragment.toLowerCase()))
      .map((name) => ({ kind: "class", name, start: offset - fragment.length, end: offset }));
  }
  const methodMatch = before.match(/^\s*(?:[A-Za-z_$][\w$]*\s*(?:=|←)\s*)?([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)?$/);
  if (!methodMatch) return [];
  const [, className, fragment = ""] = methodMatch;
  return diagrams
    .filter((item) => String(item.method.className ?? "").trim() === className)
    .filter((item) => String(item.method.name ?? "").trim().toLowerCase().startsWith(fragment.toLowerCase()))
    .map((item) => ({
      kind: "method",
      name: String(item.method.name).trim(),
      parameters: callParameters(item),
      start: offset - fragment.length,
      end: offset,
    }));
}

function showCallAutocomplete(element) {
  const offset = caretOffset(element);
  callSuggestions = callSuggestionsFor(element.textContent, offset);
  autocompleteField = element;
  activeCallSuggestion = 0;
  if (!callSuggestions.length) return hideCallAutocomplete();
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  const rect = range?.getBoundingClientRect().width || range?.getBoundingClientRect().height
    ? range.getBoundingClientRect() : element.getBoundingClientRect();
  callAutocomplete.style.left = `${Math.min(rect.left, window.innerWidth - 300)}px`;
  callAutocomplete.style.top = `${Math.min(rect.bottom + 5, window.innerHeight - 180)}px`;
  callAutocomplete.hidden = false;
  drawCallAutocomplete();
}

function drawCallAutocomplete() {
  callAutocomplete.innerHTML = callSuggestions.map((suggestion, index) => {
    const detail = suggestion.kind === "class" ? "Clase" : `(${suggestion.parameters})`;
    return `<button type="button" class="${index === activeCallSuggestion ? "active" : ""}" data-call-suggestion="${index}"><b>${esc(suggestion.name)}</b><small>${esc(detail)}</small></button>`;
  }).join("");
  $$('[data-call-suggestion]').forEach((button) => {
    button.onmousedown = (event) => {
      event.preventDefault();
      applyCallSuggestion(callSuggestions[+button.dataset.callSuggestion]);
    };
  });
}

function applyCallSuggestion(suggestion) {
  const element = autocompleteField;
  if (!element || !suggestion) return;
  const code = element.textContent;
  const replacement = suggestion.kind === "class" ? `${suggestion.name}.` : `${suggestion.name}()`;
  const caret = suggestion.kind === "class" ? replacement.length : replacement.length - 1;
  element.textContent = code.slice(0, suggestion.start) + replacement + code.slice(suggestion.end);
  const newOffset = suggestion.start + caret;
  setCaretOffset(element, newOffset);
  const block = find(+element.dataset.id);
  if (block) block.code = element.textContent.trim();
  const blockElement = element.closest(".ns-block");
  const error = callValidationError(element.textContent);
  blockElement.classList.toggle("invalid-call", Boolean(error));
  if (error) blockElement.title = error;
  else blockElement.removeAttribute("title");
  scheduleAutoSave();
  showCallAutocomplete(element);
}

function hideCallAutocomplete() {
  callAutocomplete.hidden = true;
  callSuggestions = [];
  autocompleteField = null;
}

function parseDiagramCall(code) {
  return String(code).match(/^\s*(?:([A-Za-z_$][\w$]*)\s*(?:=|←)\s*)?([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)\s*\((.*)\)\s*$/);
}

function parameterCount(item) {
  return item.declarations.filter((declaration) => declaration.kind === "parameter").length;
}

// Devuelve un mensaje si el bloque no puede invocar ni un diagrama del
// proyecto ni un método JavaScript disponible. Se usa al dibujar para que el
// error se vea antes de ejecutar el programa.
function callValidationError(code) {
  const match = parseDiagramCall(code);
  if (!match) return "Usá Clase.metodo(argumentos) en el bloque Funciones";
  const [, , className, methodName, argumentText] = match;
  const target = diagrams.find(
    (item) => String(item.method.className ?? "").trim() === className &&
      String(item.method.name ?? "").trim() === methodName,
  );
  if (target) {
    const expected = parameterCount(target);
    const received = splitArguments(argumentText).length;
    if (received !== expected)
      return `${diagramLabel(target)} espera ${expected} argumento(s); recibiste ${received}`;
    return "";
  }
  const nativeOwner = globalThis[className];
  if (nativeOwner && typeof nativeOwner[methodName] === "function") return "";
  return `No existe el método ${className}.${methodName}`;
}

// Ejecuta el método de otro diagrama. La sintaxis del bloque Funciones es
// `Clase.metodo(argumentos)` o `resultado = Clase.metodo(argumentos)`.
async function executeDiagramCall(code, callerVars = runner.vars, callStack = runner?.callStack || [activeDiagramId]) {
  const match = parseDiagramCall(code);
  if (!match) throw Error("Usá Clase.metodo(argumentos) en el bloque Funciones");
  const [, resultName, className, methodName, argumentText] = match;
  const target = diagrams.find(
    (item) => String(item.method.className ?? "").trim() === className &&
      String(item.method.name ?? "").trim() === methodName,
  );
  // Conserva la posibilidad de invocar funciones JavaScript ya disponibles
  // (por ejemplo, Math.max) cuando no hay un diagrama con esa firma.
  if (!target) {
    const nativeCall = `${className}.${methodName}(${argumentText})`;
    const value = evaluateWith(callerVars, nativeCall);
    if (resultName) callerVars[resultName] = value;
    return value;
  }
  if (callStack.includes(target.id))
    throw Error(`Llamada recursiva detectada: ${[...callStack, target.id].map((id) => diagramLabel(diagrams.find((item) => item.id === id))).join(" → ")}`);
  const args = splitArguments(argumentText).map((argument) => evaluateWith(callerVars, argument));
  const value = await runDiagramFunction(target, args, [...callStack, target.id]);
  if (resultName) callerVars[resultName] = value;
  return value;
}

// Permite el patrón de función delegadora `return Clase.metodo(argumentos)`.
// Las demás expresiones continúan usando el evaluador normal y sincrónico.
async function evaluateFunctionValue(source, vars, callStack) {
  const match = parseDiagramCall(source);
  if (match) {
    const [, resultName, className, methodName] = match;
    const target = diagrams.find(
      (item) => String(item.method.className ?? "").trim() === className &&
        String(item.method.name ?? "").trim() === methodName,
    );
    if (!resultName && target) return executeDiagramCall(source, vars, callStack);
  }
  return evaluateWith(vars, source);
}

async function runDiagramFunction(target, args, callStack) {
  const parameters = target.declarations.filter((item) => item.kind === "parameter");
  if (args.length !== parameters.length)
    throw Error(`${diagramLabel(target)} espera ${parameters.length} argumento(s); recibió ${args.length}`);
  const vars = Object.fromEntries(parameters.map((item, index) => [item.name, args[index]]));
  for (const item of target.declarations.filter((item) => item.kind !== "parameter"))
    vars[item.name] = ["declare", "constant"].includes(item.kind) ? evaluateWith(vars, item.expression) : undefined;
  const execute = async (items) => {
    for (const item of items) {
      if (item.type === "comment" || item.type === "variable") continue;
      if (item.type === "instruction") { const assignment = item.code.match(/^\s*([A-Za-z_$][\w$]*)\s*(?:=|←)\s*(.+)$/); if (!assignment) throw Error("La instrucción de una función debe ser una asignación"); vars[assignment[1]] = evaluateWith(vars, assignment[2]); }
      else if (["declare", "constant"].includes(item.type)) vars[item.name] = evaluateWith(vars, item.expression);
      else if (item.type === "output") out(evaluateWith(vars, item.expression));
      else if (item.type === "input") { const value = await ask(item); if (value === Symbol.for("cancel")) throw Error("Entrada cancelada"); vars[item.name] = parse(value); }
      else if (item.type === "call") await executeDiagramCall(item.code, vars, callStack);
      else if (item.type === "return") return { returned: true, value: await evaluateFunctionValue(item.expression, vars, callStack) };
      else if (item.type === "if") { const result = await execute(evaluateWith(vars, item.condition) ? item.then : item.else); if (result?.returned) return result; }
      else if (item.type === "switch") {
        const value = String(evaluateWith(vars, item.expression));
        const selected = item.cases.find((entry) => String(entry.value) === value);
        const result = await execute(selected ? selected.body : (Array.isArray(item.default) ? item.default : []));
        if (result?.returned) return result;
      }
      else if (item.type === "while") { let guard = 0; while (evaluateWith(vars, item.condition)) { if (++guard > 10000) throw Error("Bucle de función demasiado largo"); const result = await execute(item.body); if (result?.returned) return result; } }
      else if (item.type === "doWhile") { let guard = 0; do { if (++guard > 10000) throw Error("Bucle de función demasiado largo"); const result = await execute(item.body); if (result?.returned) return result; } while (evaluateWith(vars, item.condition)); }
      else if (item.type === "for") { const step = Number(evaluateWith(vars, item.step)); for (vars[item.variable] = evaluateWith(vars, item.start); step >= 0 ? vars[item.variable] <= evaluateWith(vars, item.end) : vars[item.variable] >= evaluateWith(vars, item.end); vars[item.variable] += step) { const result = await execute(item.body); if (result?.returned) return result; } }
      else if (item.type === "foreach") {
        const values = evaluateWith(vars, item.collection);
        if (!values?.[Symbol.iterator]) throw Error("La colección no es iterable");
        for (const value of values) { vars[item.variable] = value; const result = await execute(item.body); if (result?.returned) return result; }
      }
      else throw Error(`El bloque ${item.type} no puede ejecutarse dentro de una función`);
    }
    return null;
  };
  const result = await execute(target.blocks);
  return result?.value;
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
    if (x.kind === "comment") runner.pc++;
    else if (x.kind === "variable") {
      // Una declaración sin valor también debe existir en el contexto. Esto es
      // especialmente importante al importar .nsplus, cuyos locales simples
      // llegan como `variable` y pueden recibir un valor más adelante.
      runner.vars[b.name] = undefined;
      runner.pc++;
    }
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
      await executeDiagramCall(b.code, runner.vars, runner.callStack);
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
      const end = Number(expr(b.end));
      const start = Number(expr(b.start));
      if (!Number.isFinite(step) || step === 0)
        throw Error("El paso del PARA debe ser un número distinto de cero");
      if (!Number.isFinite(start) || !Number.isFinite(end))
        throw Error("Los límites del PARA deben ser números válidos");
      runner.loops[b.id] = { end, step };
      runner.vars[b.variable] = start;
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
      callStack: [activeDiagramId],
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
