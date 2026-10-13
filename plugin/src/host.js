const indesign = require("indesign");

const { app, ScriptLanguage, UndoModes } = indesign;

const MAX_NAMES = 60;

/**
 * Macht aus dem `host_js` eines Werkzeugs dessen aufrufbare Funktionen.
 * @param {string} code Rumpf eines CommonJS-Moduls
 * @returns {Object<string, Function>}
 */
function compile(code) {
  const module = { exports: {} };
  new Function("module", "exports", "require", "indesign", "app", code)(module, module.exports, require, indesign, app);
  return module.exports;
}

/**
 * Ruft eine Funktion eines Werkzeugs auf.
 * @param {Object<string, Function>} handlers Ergebnis von `compile`
 * @param {"read"|"change"} mode `change` fasst den Aufruf zu einem Rückgängig-Schritt zusammen
 * @param {string} name Name der Funktion
 * @param {*} args Argument aus der Oberfläche
 * @param {string} label Name des Rückgängig-Schritts
 * @returns {Promise<*>} Rückgabewert der Funktion
 */
async function run(handlers, mode, name, args, label) {
  const handler = handlers[name];
  if (typeof handler !== "function") throw new Error(`Das Werkzeug kennt die Funktion «${name}» nicht.`);
  if (mode !== "change") return handler(args);

  let ran = false;
  let result;
  try {
    app.doScript(
      () => {
        ran = true;
        result = handler(args);
      },
      ScriptLanguage.UXPSCRIPT,
      [],
      UndoModes.ENTIRE_SCRIPT,
      label,
    );
  } catch (error) {
    // Nur ein Fehler aus dem Werkzeug selbst wird gemeldet.
    if (ran) throw error;
  }
  // Nimmt doScript keine Funktion an, läuft der Aufruf ohne zusammengefassten Rückgängig-Schritt.
  if (!ran) result = handler(args);
  return result;
}

function names(collection) {
  try {
    const all = [].concat(collection().everyItem().name);
    return all.length > MAX_NAMES ? all.slice(0, MAX_NAMES).concat(`… (${all.length} insgesamt)`) : all;
  } catch (error) {
    return [];
  }
}

function attempt(read, fallback) {
  try {
    return read();
  } catch (error) {
    return fallback;
  }
}

/**
 * Beschreibt das aktive Dokument als Kontext für Claude.
 * @returns {string} JSON-Text, oder ein Hinweis, wenn kein Dokument offen ist
 */
function describeDocument() {
  if (!attempt(() => app.documents.length, 0)) return "Es ist kein Dokument geöffnet.";
  const doc = app.activeDocument;
  return JSON.stringify(
    {
      name: attempt(() => doc.name, ""),
      seiten: attempt(() => doc.pages.length, null),
      druckbogen: attempt(() => doc.spreads.length, null),
      linealeinheit: attempt(() => String(doc.viewPreferences.horizontalMeasurementUnits), null),
      seitenformat: attempt(
        () => [doc.documentPreferences.pageWidth, doc.documentPreferences.pageHeight],
        null,
      ),
      textabschnitte: attempt(() => doc.stories.length, null),
      seitenobjekte: attempt(() => doc.allPageItems.length, null),
      verknuepfungen: attempt(() => doc.links.length, null),
      ebenen: names(() => doc.layers),
      absatzformate: names(() => doc.paragraphStyles),
      zeichenformate: names(() => doc.characterStyles),
      objektformate: names(() => doc.objectStyles),
      farbfelder: names(() => doc.swatches),
      musterseiten: names(() => doc.masterSpreads),
      auswahl: attempt(() => [].concat(app.selection).map((item) => item.constructor.name), []),
    },
    null,
    1,
  );
}

/**
 * Helles oder dunkles Thema der InDesign-Oberfläche.
 * @returns {"dark"|"light"}
 */
function theme() {
  return attempt(() => app.generalPreferences.uiBrightnessPreference, 0) > 0.5 ? "light" : "dark";
}

module.exports = { compile, run, describeDocument, theme };
