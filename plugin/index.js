const { entrypoints } = require("uxp");
const claude = require("./src/claude.js");
const tools = require("./src/tools.js");
const host = require("./src/host.js");

const MAX_ERRORS = 10;

const PHASES = {
  wartet: "Claude liest den Auftrag",
  denkt: "Claude denkt nach",
  schreibt: "Claude schreibt das Werkzeug",
  fertig: "Claude ist fertig",
};

function formatTokens(count) {
  return count < 1000 ? String(count) : `${(count / 1000).toFixed(1)}k`;
}

function tokenLine(progress) {
  const input = progress.input ? `↑ ${formatTokens(progress.input)}` : "↑ –";
  return `${input} · ↓ ${progress.exact ? "" : "≈ "}${formatTokens(progress.output)} Tokens`;
}

const $ = (id) => document.getElementById(id);

/** Geöffnetes Werkzeug: Metadaten, Funktionen und die Fehler aus dem laufenden Betrieb. */
let active = null;
let busy = false;

entrypoints.setup({
  panels: {
    pirate: {
      show() {},
    },
  },
});

function setStatus(id, text, isError) {
  const node = $(id);
  node.textContent = text || "";
  node.className = isError ? "status error" : "status";
}

function setBusy(state) {
  busy = state;
  for (const id of ["btn-create", "btn-change", "btn-reload", "btn-back"]) $(id).disabled = state;
}

function showView(name) {
  $("view-shelf").className = name === "shelf" ? "view" : "view hidden";
  $("view-tool").className = name === "tool" ? "view" : "view hidden";
}

async function renderList() {
  const list = $("tool-list");
  const metas = await tools.list();
  list.innerHTML = "";

  if (!metas.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Noch kein Werkzeug. Beschreibe unten, was Du brauchst.";
    list.appendChild(empty);
    return;
  }

  for (const meta of metas) {
    const row = document.createElement("div");
    row.className = "tool";

    const text = document.createElement("div");
    text.className = "tool-text";
    const name = document.createElement("div");
    name.className = "tool-name";
    name.textContent = meta.name;
    const summary = document.createElement("div");
    summary.className = "tool-summary";
    summary.textContent = meta.summary;
    text.appendChild(name);
    text.appendChild(summary);

    row.addEventListener("click", () => openTool(meta.id));

    const remove = document.createElement("div");
    remove.className = "ghost trash";
    remove.setAttribute("title", "Werkzeug löschen");
    remove.innerHTML =
      '<img class="on-dark" src="icons/trash-dark.svg" alt="Löschen" /><img class="on-light" src="icons/trash-light.svg" alt="Löschen" />';
    const cancel = document.createElement("div");
    cancel.className = "ghost hidden";
    cancel.textContent = "Abbrechen";
    const confirm = document.createElement("div");
    confirm.className = "ghost confirm hidden";
    confirm.textContent = "Löschen";

    // Der Papierkorb fragt nach, statt zu löschen: UXP kennt kein confirm().
    const ask = (asking) => {
      remove.className = asking ? "ghost trash hidden" : "ghost trash";
      cancel.className = asking ? "ghost" : "ghost hidden";
      confirm.className = asking ? "ghost confirm" : "ghost confirm hidden";
    };
    // Die Klicks gelten dem Löschen, nicht der Zeile.
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      ask(true);
    });
    cancel.addEventListener("click", (event) => {
      event.stopPropagation();
      ask(false);
    });
    confirm.addEventListener("click", async (event) => {
      event.stopPropagation();
      await tools.remove(meta.id);
      await renderList();
    });

    row.appendChild(text);
    row.appendChild(remove);
    row.appendChild(cancel);
    row.appendChild(confirm);
    list.appendChild(row);
  }
}

function formatDate(iso) {
  const date = new Date(iso);
  const two = (number) => String(number).padStart(2, "0");
  return `${two(date.getDate())}.${two(date.getMonth() + 1)}.${date.getFullYear()} ${two(date.getHours())}:${two(date.getMinutes())}`;
}

async function showLog() {
  const list = $("log");
  const entries = (await tools.log(active.meta.id)).reverse();
  list.innerHTML = "";

  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Zu diesem Werkzeug ist noch kein Auftrag aufgezeichnet.";
    list.appendChild(empty);
  }
  for (const entry of entries) {
    const item = document.createElement("div");
    item.className = "log-entry";
    const head = document.createElement("div");
    head.className = "log-head";
    head.textContent = `${formatDate(entry.at)} · ${entry.kind} · ${tokenLine({ input: entry.input, output: entry.output, exact: true })}`;
    const prompt = document.createElement("div");
    prompt.className = "log-prompt";
    prompt.textContent = entry.prompt;
    item.appendChild(head);
    item.appendChild(prompt);
    list.appendChild(item);
  }

  // Die Webview liegt als eigene Ebene über dem Bedienfeld und wird deshalb entfernt statt versteckt.
  $("stage").innerHTML = "";
  $("stage").className = "stage hidden";
  list.className = "list";
  $("btn-log").textContent = "Werkzeug";
}

function hideLog() {
  $("log").className = "list hidden";
  $("stage").className = "stage";
  $("btn-log").textContent = "Verlauf";
}

function mountWebview(id) {
  const stage = $("stage");
  stage.innerHTML = "";
  const view = document.createElement("webview");
  view.setAttribute("id", "tool-view");
  view.setAttribute("width", "100%");
  view.setAttribute("height", "100%");
  view.setAttribute("src", `plugin-data:/tools/${id}/ui.html`);
  stage.appendChild(view);
}

function post(message) {
  const view = $("tool-view");
  if (view) view.postMessage(Object.assign({ pirate: 1 }, message));
}

function noteError(text) {
  if (!active) return;
  active.errors.push(text);
  if (active.errors.length > MAX_ERRORS) active.errors.shift();
  setStatus("tool-status", `${text}\nDer Fehler geht beim nächsten «Ändern» an Claude mit.`, true);
}

async function openTool(id) {
  if (busy) return;
  try {
    const { meta, files } = await tools.load(id);
    active = { meta, files, handlers: {}, errors: [] };
    $("tool-name").textContent = meta.name;
    setStatus("tool-status", "");
    hideLog();
    showView("tool");
    try {
      active.handlers = host.compile(files.host_js);
    } catch (error) {
      noteError(`host_js lässt sich nicht laden: ${error.message}`);
    }
    mountWebview(id);
  } catch (error) {
    setStatus("shelf-status", `Das Werkzeug lässt sich nicht öffnen: ${error.message}`, true);
  }
}

async function onMessage(event) {
  let message = event.data;
  if (typeof message === "string") {
    try {
      message = JSON.parse(message);
    } catch (error) {
      return;
    }
  }
  if (!active || !message || message.pirate !== 1) return;

  if (message.kind === "ready") {
    post({ kind: "theme", theme: host.theme() });
    return;
  }
  if (message.kind === "error") {
    noteError(`Oberfläche: ${message.message}`);
    return;
  }
  if (message.kind === "call") {
    try {
      const value = await host.run(active.handlers, message.mode, message.name, message.args, active.meta.name);
      post({ kind: "result", id: message.id, ok: true, value: value === undefined ? null : value });
    } catch (error) {
      noteError(`${message.name}: ${error.message}`);
      post({ kind: "result", id: message.id, ok: false, error: error.message });
    }
  }
}

async function build(request, statusId) {
  if (busy) return;
  if (!request.trim()) {
    setStatus(statusId, "Beschreibe zuerst, was Du brauchst.", true);
    return;
  }
  const editing = statusId === "tool-status" ? active : null;

  setBusy(true);
  const started = Date.now();
  let progress = { phase: "wartet", input: 0, output: 0, exact: false };
  const render = () => {
    const seconds = Math.round((Date.now() - started) / 1000);
    setStatus(statusId, `${PHASES[progress.phase]} … ${seconds} s · ${tokenLine(progress)}`);
  };
  render();
  // Die Uhr läuft unabhängig vom Datenstrom, damit auch beim Warten sichtbar etwas geschieht.
  const clock = setInterval(render, 1000);
  try {
    const { files, usage } = await claude.generate(
      {
        system: await tools.systemPrompt(),
        request,
        context: host.describeDocument(),
        current: editing ? editing.files : undefined,
        errors: editing ? editing.errors : undefined,
      },
      (update) => {
        progress = update;
        render();
      },
    );
    clearInterval(clock);
    const meta = await tools.save(editing ? editing.meta.id : null, files, {
      prompt: request,
      input: usage.input,
      output: usage.output,
    });
    $(editing ? "change" : "prompt").value = "";
    setStatus(statusId, "");
    setBusy(false);
    await renderList();
    await openTool(meta.id);
    const seconds = Math.round((Date.now() - started) / 1000);
    setStatus("tool-status", `Gebaut in ${seconds} s · ${tokenLine(usage)}`);
  } catch (error) {
    setStatus(statusId, error.message, true);
  } finally {
    clearInterval(clock);
    setBusy(false);
  }
}

async function initSettings() {
  const select = $("model");
  for (const model of claude.MODELS) {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = model.label;
    select.appendChild(option);
  }
  select.selectedIndex = claude.MODELS.findIndex((model) => model.id === claude.getModel());
  $("api-key").value = await claude.getApiKey();
  $("folder-path").textContent = await tools.folderPath();

  // Ohne Key ist nichts zu tun: Einstellungen gleich zeigen.
  if (!$("api-key").value) $("settings").className = "box";
}

$("btn-settings").addEventListener("click", () => {
  $("settings").className = $("settings").className === "box" ? "box hidden" : "box";
});

$("btn-save-settings").addEventListener("click", async () => {
  await claude.setApiKey($("api-key").value.trim());
  claude.setModel(claude.MODELS[Math.max(0, $("model").selectedIndex)].id);
  $("settings").className = "box hidden";
  setStatus("shelf-status", "Einstellungen gespeichert.");
});

$("btn-create").addEventListener("click", () => build($("prompt").value, "shelf-status"));
$("btn-change").addEventListener("click", () => build($("change").value, "tool-status"));
$("btn-reload").addEventListener("click", () => active && openTool(active.meta.id));
$("btn-log").addEventListener("click", () => {
  if (!active || busy) return;
  if ($("log").className === "list") openTool(active.meta.id);
  else showLog();
});
$("btn-back").addEventListener("click", () => {
  if (busy) return;
  active = null;
  $("stage").innerHTML = "";
  showView("shelf");
});

window.addEventListener("message", onMessage);

initSettings().catch((error) => setStatus("shelf-status", error.message, true));
renderList().catch((error) => setStatus("shelf-status", error.message, true));
