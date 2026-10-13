const indesign = require("indesign");
const { t } = require("./i18n.js");

/**
 * Die InDesign-Anwendung. Sie wird bei jedem Gebrauch frisch geholt: Wird das Plugin beim Start
 * von InDesign geladen, steht sie zu diesem Zeitpunkt noch nicht bereit.
 */
function getApp() {
  const app = indesign.app || require("indesign").app;
  if (!app) throw new Error(t("notReady"));
  return app;
}

const MAX_NAMES = 60;

/**
 * Macht aus dem `host_js` eines Werkzeugs dessen aufrufbare Funktionen.
 * @param {string} code Rumpf eines CommonJS-Moduls
 * @returns {Object<string, Function>}
 */
function compile(code) {
  const module = { exports: {} };
  new Function("module", "exports", "require", "indesign", "app", code)(module, module.exports, require, indesign, getApp());
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
  if (typeof handler !== "function") throw new Error(t("unknownFunction", { name }));
  if (mode !== "change") return handler(args);

  let ran = false;
  let result;
  try {
    getApp().doScript(
      () => {
        ran = true;
        result = handler(args);
      },
      indesign.ScriptLanguage.UXPSCRIPT,
      [],
      indesign.UndoModes.ENTIRE_SCRIPT,
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
    return all.length > MAX_NAMES ? all.slice(0, MAX_NAMES).concat(`… (${all.length} in total)`) : all;
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
  if (!attempt(() => getApp().documents.length, 0)) return "No document is open.";
  const app = getApp();
  const doc = app.activeDocument;
  return JSON.stringify(
    {
      name: attempt(() => doc.name, ""),
      pages: attempt(() => doc.pages.length, null),
      spreads: attempt(() => doc.spreads.length, null),
      rulerUnits: attempt(() => String(doc.viewPreferences.horizontalMeasurementUnits), null),
      pageSize: attempt(
        () => [doc.documentPreferences.pageWidth, doc.documentPreferences.pageHeight],
        null,
      ),
      stories: attempt(() => doc.stories.length, null),
      pageItems: attempt(() => doc.allPageItems.length, null),
      links: attempt(() => doc.links.length, null),
      layers: names(() => doc.layers),
      paragraphStyles: names(() => doc.paragraphStyles),
      characterStyles: names(() => doc.characterStyles),
      objectStyles: names(() => doc.objectStyles),
      swatches: names(() => doc.swatches),
      masterSpreads: names(() => doc.masterSpreads),
      selection: attempt(() => [].concat(app.selection).map((item) => item.constructor.name), []),
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
  return attempt(() => getApp().generalPreferences.uiBrightnessPreference, 0) > 0.5 ? "light" : "dark";
}

module.exports = { compile, run, describeDocument, theme };
