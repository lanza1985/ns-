// Metadata de sesión y examen para el contenedor .nsplus de NSPlus.
const sessionStart = new Date();

function parseExamDate(encoded) {
  if (!encoded) return null;
  try {
    const value = base64ToUtf8(encoded);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

function parseExamContextFromUrl(search = window.location.search) {
  const params = new URLSearchParams(search);
  const startEncoded = params.get("k");
  const endEncoded = params.get("k2");
  return {
    start: parseExamDate(startEncoded),
    end: parseExamDate(endEncoded),
    // NSPlus utiliza el valor Base64 original de k para sem.
    sem: startEncoded,
    course: params.get("curso"),
    user: params.get("usuario"),
    userId: params.get("idusr"),
  };
}

const examContext = parseExamContextFromUrl();

function isExamActive(now = new Date(), context = examContext) {
  return Boolean(context.start && context.end &&
    context.start <= now && now <= context.end);
}

function getExamContext(now = new Date()) {
  return { ...examContext, enabled: isExamActive(now) };
}

function createSessionMetadata(now = new Date()) {
  const context = getExamContext(now);
  const info = {
    usr: context.user || "Sin autor",
    com: context.course || "Sin comisión",
    start: sessionStart.toISOString(),
    minutes: Math.max(0, Math.floor((now.getTime() - sessionStart.getTime()) / 60000)),
  };
  if (context.enabled) info.sem = context.sem;
  return info;
}

function createSaveMetadata(now = new Date()) {
  const context = getExamContext(now);
  const info = createSessionMetadata(now);
  return {
    usr: info.usr,
    uid: context.userId,
    com: info.com,
    date: now.toISOString(),
    minutes: info.minutes,
    ...(context.enabled ? { sem: context.sem } : {}),
  };
}

function nsPlusFilename(name) {
  const clean = (value) => String(value).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/g, "") || "diagrama";
  const context = getExamContext();
  if (context.course && context.userId)
    return `${clean(context.course)}_${clean(context.userId)}_${clean(name || "diagrama")}.nsplus`;
  return `${name || "diagrama"}.nsplus`;
}
