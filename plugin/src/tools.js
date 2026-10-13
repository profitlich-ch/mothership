const { storage } = require("uxp");

const fs = storage.localFileSystem;

const FOLDER_TOKEN = "ai-pirate-folder-token";
const FOLDER_PATH = "ai-pirate-folder-path";
/** Was ein Werkzeug ausmacht; die angezeigte ui.html entsteht daraus beim Öffnen. */
const TOOL_FILES = ["ui.src.html", "host.js", "log.json", "meta.json"];

/**
 * @typedef {object} ToolMeta
 * @property {string} id Ordnername des Werkzeugs
 * @property {string} name Anzeigename
 * @property {string} summary Ein Satz zum Zweck
 * @property {string} updated Zeitpunkt der letzten Änderung (ISO)
 */

/**
 * @typedef {object} ToolFiles
 * @property {string} name Anzeigename
 * @property {string} summary Ein Satz zum Zweck
 * @property {string} ui_html Oberfläche, wie Claude sie geliefert hat
 * @property {string} host_js Dokumentzugriff
 */

async function childFolder(parent, name) {
  try {
    return await parent.getEntry(name);
  } catch (error) {
    return parent.createFolder(name);
  }
}

/** Datenordner des Plugins: der einzige Ort neben dem Plugin selbst, aus dem die Webview laden kann. */
async function cacheFolder() {
  return childFolder(await fs.getDataFolder(), "tools");
}

/** Ordner, in dem die Werkzeuge liegen: der gewählte, sonst der Datenordner. */
async function toolsFolder() {
  const token = localStorage.getItem(FOLDER_TOKEN);
  if (!token) return cacheFolder();
  try {
    return await fs.getEntryForPersistentToken(token);
  } catch (error) {
    throw new Error(
      `Der Werkzeugordner «${localStorage.getItem(FOLDER_PATH)}» ist nicht erreichbar. Prüfe, ob er noch existiert und Google Drive läuft, oder wähle ihn in den Einstellungen neu.`,
    );
  }
}

async function removeFolder(parent, name) {
  try {
    const folder = await parent.getEntry(name);
    for (const entry of await folder.getEntries()) await entry.delete();
    await folder.delete();
  } catch (error) {
    // Nicht vorhanden heisst: schon gelöscht.
  }
}

async function readText(folder, name) {
  const file = await folder.getEntry(name);
  return file.read();
}

async function writeText(folder, name, text) {
  const file = await folder.createFile(name, { overwrite: true });
  await file.write(text);
}

async function kitFile(name) {
  const folder = await (await fs.getPluginFolder()).getEntry("kit");
  return readText(folder, name);
}

/** Setzt Grundgerüst und Brücke in den Kopf der Oberfläche ein. */
async function withKit(html) {
  const kit = `<style>${await kitFile("kit.css")}</style><script>${await kitFile("bridge.js")}</script>`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (head) => head + kit);
  return kit + html;
}

function slug(name) {
  const base = name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base || "werkzeug"}-${Date.now().toString(36)}`;
}

/**
 * Liest den Anweisungstext, der Claude das Format der Werkzeuge erklärt.
 * @returns {Promise<string>}
 */
function systemPrompt() {
  return kitFile("system-prompt.md");
}

/**
 * Listet alle gespeicherten Werkzeuge, das zuletzt geänderte zuerst.
 * @returns {Promise<ToolMeta[]>}
 */
async function list() {
  const entries = await (await toolsFolder()).getEntries();
  const metas = [];
  for (const entry of entries) {
    if (!entry.isFolder) continue;
    try {
      metas.push(JSON.parse(await readText(entry, "meta.json")));
    } catch (error) {
      // Ordner ohne lesbare meta.json ist kein Werkzeug – etwa ein abgebrochener Schreibvorgang.
    }
  }
  return metas.sort((a, b) => (a.updated < b.updated ? 1 : -1));
}

/**
 * Lädt ein Werkzeug samt Code.
 * @param {string} id Ordnername des Werkzeugs
 * @returns {Promise<{meta: ToolMeta, files: ToolFiles}>}
 */
async function load(id) {
  const folder = await (await toolsFolder()).getEntry(id);
  const meta = JSON.parse(await readText(folder, "meta.json"));
  return {
    meta,
    files: {
      name: meta.name,
      summary: meta.summary,
      ui_html: await readText(folder, "ui.src.html"),
      host_js: await readText(folder, "host.js"),
    },
  };
}

/**
 * @typedef {object} LogEntry
 * @property {string} at Zeitpunkt (ISO)
 * @property {"erstellt"|"geändert"} kind
 * @property {string} prompt Auftrag im Wortlaut
 * @property {number} input Tokens der Anfrage
 * @property {number} output Tokens der Antwort
 */

/**
 * Liest das Auftragsprotokoll eines Werkzeugs, ältester Eintrag zuerst.
 * @param {string} id Ordnername des Werkzeugs
 * @returns {Promise<LogEntry[]>}
 */
async function log(id) {
  try {
    const folder = await (await toolsFolder()).getEntry(id);
    return JSON.parse(await readText(folder, "log.json"));
  } catch (error) {
    return [];
  }
}

/**
 * Speichert ein neues Werkzeug oder überschreibt ein bestehendes.
 * @param {string|null} id Ordnername eines bestehenden Werkzeugs, `null` für ein neues
 * @param {ToolFiles} files Inhalt des Werkzeugs
 * @param {{prompt: string, input: number, output: number}} request Auftrag, der zu diesem Stand geführt hat
 * @returns {Promise<ToolMeta>}
 */
async function save(id, files, request) {
  const meta = {
    id: id || slug(files.name),
    name: files.name,
    summary: files.summary,
    updated: new Date().toISOString(),
  };
  const folder = await childFolder(await toolsFolder(), meta.id);
  await writeText(folder, "ui.src.html", files.ui_html);
  await writeText(folder, "host.js", files.host_js);
  const entries = await log(meta.id);
  entries.push({
    at: meta.updated,
    kind: id ? "geändert" : "erstellt",
    prompt: request.prompt,
    input: request.input,
    output: request.output,
  });
  await writeText(folder, "log.json", JSON.stringify(entries, null, 2));
  // meta.json zuletzt: Erst sie macht den Ordner in der Liste zum Werkzeug.
  await writeText(folder, "meta.json", JSON.stringify(meta, null, 2));
  return meta;
}

/**
 * Löscht ein Werkzeug.
 * @param {string} id Ordnername des Werkzeugs
 * @returns {Promise<void>}
 */
async function remove(id) {
  await removeFolder(await toolsFolder(), id);
  await removeFolder(await cacheFolder(), id);
}

/**
 * Bereitet ein Werkzeug zum Anzeigen vor: schreibt seine Oberfläche mit Grundgerüst und Brücke
 * in den Datenordner. Danach lädt die Webview `plugin-data:/tools/<id>/ui.html`.
 * @param {string} id Ordnername des Werkzeugs
 * @returns {Promise<void>}
 */
async function stage(id) {
  const source = await (await toolsFolder()).getEntry(id);
  const cache = await childFolder(await cacheFolder(), id);
  await writeText(cache, "ui.html", await withKit(await readText(source, "ui.src.html")));
}

/**
 * Pfad des Werkzeugordners auf der Festplatte.
 * @returns {Promise<string>}
 */
async function folderPath() {
  return localStorage.getItem(FOLDER_TOKEN) ? localStorage.getItem(FOLDER_PATH) : (await cacheFolder()).nativePath;
}

/**
 * Ob die Werkzeuge in einem selbst gewählten Ordner liegen.
 * @returns {boolean}
 */
function hasCustomFolder() {
  return Boolean(localStorage.getItem(FOLDER_TOKEN));
}

/** Kopiert Werkzeuge, die es im Ziel noch nicht gibt. */
async function copyMissing(from, to) {
  let copied = 0;
  for (const entry of await from.getEntries()) {
    if (!entry.isFolder) continue;
    const exists = await to.getEntry(entry.name).then(
      () => true,
      () => false,
    );
    const isTool = await entry.getEntry("meta.json").then(
      () => true,
      () => false,
    );
    if (exists || !isTool) continue;
    const target = await to.createFolder(entry.name);
    for (const name of TOOL_FILES) {
      try {
        await writeText(target, name, await readText(entry, name));
      } catch (error) {
        // log.json fehlt bei Werkzeugen aus der Zeit vor dem Verlauf.
      }
    }
    copied += 1;
  }
  return copied;
}

/**
 * Lässt den Nutzer einen Werkzeugordner wählen, etwa in Google Drive, und kopiert die bisherigen
 * Werkzeuge hinein, soweit sie dort fehlen.
 * @returns {Promise<{path: string, copied: number}|null>} `null`, wenn der Dialog abgebrochen wurde
 */
async function chooseFolder() {
  const folder = await fs.getFolder();
  if (!folder) return null;
  const previous = await toolsFolder().catch(() => null);
  const copied = previous && previous.nativePath !== folder.nativePath ? await copyMissing(previous, folder) : 0;
  localStorage.setItem(FOLDER_TOKEN, await fs.createPersistentToken(folder));
  localStorage.setItem(FOLDER_PATH, folder.nativePath);
  return { path: folder.nativePath, copied };
}

/** Legt die Werkzeuge wieder in den Datenordner des Plugins. Der gewählte Ordner bleibt unberührt. */
function resetFolder() {
  localStorage.removeItem(FOLDER_TOKEN);
  localStorage.removeItem(FOLDER_PATH);
}

module.exports = {
  systemPrompt,
  list,
  load,
  log,
  save,
  remove,
  stage,
  folderPath,
  hasCustomFolder,
  chooseFolder,
  resetFolder,
};
