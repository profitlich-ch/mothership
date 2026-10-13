const { storage } = require("uxp");

const API_URL = "https://api.anthropic.com/v1/messages";
const KEY_NAME = "anthropic-api-key";
const MODEL_NAME = "ai-pirate-model";

/** Wählbare Modelle; das erste ist die Vorgabe. */
const MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (schneller, günstiger)" },
  { id: "claude-fable-5-1", label: "Claude Fable 5.1 (am stärksten, teurer)" },
];

const TOOL_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    summary: { type: "string" },
    ui_html: { type: "string" },
    host_js: { type: "string" },
  },
  required: ["name", "summary", "ui_html", "host_js"],
  additionalProperties: false,
};

/**
 * Liest den gespeicherten API-Key.
 * @returns {Promise<string>} leer, wenn keiner hinterlegt ist
 */
async function getApiKey() {
  try {
    const bytes = await storage.secureStorage.getItem(KEY_NAME);
    return bytes ? String.fromCharCode(...bytes) : "";
  } catch (error) {
    return "";
  }
}

/**
 * Legt den API-Key im sicheren Speicher von UXP ab.
 * @param {string} key API-Key, leer zum Entfernen
 * @returns {Promise<void>}
 */
async function setApiKey(key) {
  if (key) await storage.secureStorage.setItem(KEY_NAME, key);
  else await storage.secureStorage.removeItem(KEY_NAME);
}

/**
 * Gewähltes Modell.
 * @returns {string} Modell-ID
 */
function getModel() {
  const stored = localStorage.getItem(MODEL_NAME);
  return MODELS.some((model) => model.id === stored) ? stored : MODELS[0].id;
}

/**
 * @param {string} id Modell-ID aus `MODELS`
 */
function setModel(id) {
  localStorage.setItem(MODEL_NAME, id);
}

function section(tag, text) {
  return `<${tag}>\n${text}\n</${tag}>`;
}

function failure(status, body) {
  const detail = body && body.error && body.error.message ? ` (${body.error.message})` : "";
  if (status === 401) return "Der API-Key wurde abgelehnt. Prüfe ihn in den Einstellungen.";
  if (status === 429) return `Das Limit des API-Kontos ist erreicht. Versuche es in einer Minute erneut.${detail}`;
  if (status >= 500) return `Die Claude-API ist gerade überlastet oder gestört (${status}). Versuche es erneut.`;
  return `Die Claude-API hat die Anfrage abgelehnt (${status}).${detail}`;
}

/**
 * @typedef {object} GenerateOptions
 * @property {string} system Anweisungstext zum Werkzeugformat
 * @property {string} request Auftrag des Nutzers
 * @property {string} context Beschreibung des aktiven Dokuments
 * @property {{ui_html: string, host_js: string}} [current] bisheriger Code bei einer Änderung
 * @property {string[]} [errors] Fehler, die das Werkzeug zuletzt gemeldet hat
 */

/**
 * @typedef {object} Progress
 * @property {"wartet"|"denkt"|"schreibt"|"fertig"} phase
 * @property {number} input Tokens der Anfrage, 0 solange unbekannt
 * @property {number} output Tokens der Antwort
 * @property {boolean} exact `false`, solange `output` aus der Textlänge geschätzt ist
 */

/** Liest den Ereignisstrom der API und meldet den Fortschritt. */
function streamReader(onProgress) {
  const state = { buffer: "", text: "", chars: 0, stopReason: null };
  const progress = { phase: "wartet", input: 0, output: 0, exact: false };

  function handle(event) {
    if (event.type === "error") throw new Error(`Die Claude-API hat die Antwort abgebrochen: ${event.error.message}`);
    if (event.type === "message_start") progress.input = event.message.usage.input_tokens || 0;
    if (event.type === "content_block_delta") {
      const delta = event.delta;
      const piece = delta.text || delta.thinking || "";
      if (delta.type === "text_delta") state.text += delta.text;
      progress.phase = delta.type === "text_delta" ? "schreibt" : "denkt";
      state.chars += piece.length;
      // Die genaue Zahl kommt erst am Ende; bis dahin etwa ein Token je 3,5 Zeichen.
      progress.output = Math.round(state.chars / 3.5);
    }
    if (event.type === "message_delta") {
      state.stopReason = event.delta.stop_reason || state.stopReason;
      if (event.usage && event.usage.output_tokens) {
        progress.output = event.usage.output_tokens;
        progress.exact = true;
        progress.phase = "fertig";
      }
    }
    onProgress(Object.assign({}, progress));
  }

  return {
    state,
    progress,
    push(chunk) {
      state.buffer += chunk;
      const blocks = state.buffer.split(/\r?\n\r?\n/);
      state.buffer = blocks.pop();
      for (const block of blocks) {
        const data = block
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("");
        if (data) handle(JSON.parse(data));
      }
    },
  };
}

/**
 * Lässt Claude ein Werkzeug bauen oder ändern.
 * @param {GenerateOptions} options
 * @param {function(Progress): void} [onProgress] wird bei jedem Fortschritt aufgerufen
 * @returns {Promise<{files: {name: string, summary: string, ui_html: string, host_js: string}, usage: Progress}>}
 */
async function generate(options, onProgress = () => {}) {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error("Es ist kein API-Key hinterlegt. Trage ihn in den Einstellungen ein.");

  const parts = [section("auftrag", options.request), section("dokument", options.context)];
  if (options.current) {
    parts.push(section("bisheriges_ui_html", options.current.ui_html));
    parts.push(section("bisheriges_host_js", options.current.host_js));
  }
  if (options.errors && options.errors.length) parts.push(section("gemeldete_fehler", options.errors.join("\n")));

  let response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "server-side-fallback-2026-07-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: getModel(),
        max_tokens: 64000,
        stream: true,
        // Zusammengefasstes Nachdenken, damit der Zähler auch vor dem ersten Code läuft.
        thinking: { type: "adaptive", display: "summarized" },
        // Lehnt ein Sicherheitsfilter die Anfrage ab, beantwortet sie ein Ersatzmodell.
        fallbacks: "default",
        output_config: { effort: "high", format: { type: "json_schema", schema: TOOL_SCHEMA } },
        system: options.system,
        messages: [{ role: "user", content: parts.join("\n\n") }],
      }),
    });
  } catch (error) {
    throw new Error(`Die Claude-API ist nicht erreichbar: ${error.message}`);
  }

  if (!response.ok) throw new Error(failure(response.status, await response.json().catch(() => null)));

  const reader = streamReader(onProgress);
  if (response.body && response.body.getReader && typeof TextDecoder !== "undefined") {
    const source = response.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await source.read();
      if (done) break;
      reader.push(decoder.decode(value, { stream: true }));
    }
  } else {
    // Kann UXP die Antwort nicht stückweise lesen, kommen alle Ereignisse am Ende auf einmal.
    reader.push(await response.text());
  }
  reader.push("\n\n");

  const { stopReason, text } = reader.state;
  if (stopReason === "refusal") throw new Error("Claude hat diesen Auftrag abgelehnt. Formuliere ihn anders.");
  if (stopReason === "max_tokens") {
    throw new Error("Das Werkzeug ist für eine einzelne Antwort zu gross geworden. Teile den Auftrag in kleinere Schritte.");
  }

  try {
    return { files: JSON.parse(text), usage: Object.assign({}, reader.progress) };
  } catch (error) {
    throw new Error("Die Antwort von Claude liess sich nicht lesen. Versuche es erneut.");
  }
}

module.exports = { MODELS, getApiKey, setApiKey, getModel, setModel, generate };
