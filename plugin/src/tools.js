const { storage } = require("uxp");

const fs = storage.localFileSystem;

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

async function toolsFolder() {
  return childFolder(await fs.getDataFolder(), "tools");
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
  await writeText(folder, "ui.html", await withKit(files.ui_html));
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
  const folder = await (await toolsFolder()).getEntry(id);
  for (const entry of await folder.getEntries()) await entry.delete();
  await folder.delete();
}

/**
 * Pfad des Werkzeugordners auf der Festplatte, zum Nachsehen und Sichern.
 * @returns {Promise<string>}
 */
async function folderPath() {
  return (await toolsFolder()).nativePath;
}

module.exports = { systemPrompt, list, load, log, save, remove, folderPath };
