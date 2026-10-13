const TEXTS = {
  de: {
    settings: "Einstellungen",
    apiKey: "Claude-API-Key",
    model: "Modell",
    save: "Speichern",
    toolFolder: "Werkzeugordner",
    defaultFolder: "Standardordner",
    chooseFolder: "Ordner wählen",
    promptPlaceholder:
      "Welches Werkzeug brauchst Du? Zum Beispiel: Zeige alle Absatzformate als Balken nach Häufigkeit und lass mich eines per Klick im Dokument auswählen.",
    build: "Werkzeug bauen",
    shelf: "‹ Regal",
    history: "Verlauf",
    tool: "Werkzeug",
    reload: "Neu laden",
    changePlaceholder: "Was soll sich an diesem Werkzeug ändern?",
    change: "Ändern",
    emptyShelf: "Noch kein Werkzeug. Beschreibe unten, was Du brauchst.",
    deleteTool: "Werkzeug löschen",
    cancel: "Abbrechen",
    delete: "Löschen",
    emptyLog: "Zu diesem Werkzeug ist noch kein Auftrag aufgezeichnet.",
    created: "erstellt",
    changed: "geändert",
    errorGoesAlong: "Der Fehler geht beim nächsten «Ändern» an Claude mit.",
    hostLoadFailed: "host_js lässt sich nicht laden: {detail}",
    openFailed: "Das Werkzeug lässt sich nicht öffnen: {detail}",
    uiError: "Oberfläche: {detail}",
    describeFirst: "Beschreibe zuerst, was Du brauchst.",
    phaseWaiting: "Claude liest den Auftrag",
    phaseThinking: "Claude denkt nach",
    phaseWriting: "Claude schreibt das Werkzeug",
    phaseDone: "Claude ist fertig",
    built: "Gebaut in {seconds} s",
    settingsSaved: "Einstellungen gespeichert.",
    folderNow: "Die Werkzeuge liegen jetzt in «{path}».",
    folderCopied: "{count} bisherige Werkzeuge wurden hineinkopiert.",
    folderUnusable: "Der Ordner lässt sich nicht verwenden: {detail}",
    folderReset: "Die Werkzeuge liegen wieder im Datenordner des Plugins. Der bisherige Ordner bleibt unverändert.",
    folderUnreachable:
      "Der Werkzeugordner «{path}» ist nicht erreichbar. Prüfe, ob er noch existiert und Google Drive läuft, oder wähle ihn in den Einstellungen neu.",
    modelSonnet: "{name} (schneller, günstiger)",
    modelFable: "{name} (am stärksten, teurer)",
    noKey: "Es ist kein API-Key hinterlegt. Trage ihn in den Einstellungen ein.",
    apiUnreachable: "Die Claude-API ist nicht erreichbar: {detail}",
    keyRejected: "Der API-Key wurde abgelehnt. Prüfe ihn in den Einstellungen.",
    rateLimit: "Das Limit des API-Kontos ist erreicht. Versuche es in einer Minute erneut.",
    overloaded: "Die Claude-API ist gerade überlastet oder gestört ({status}). Versuche es erneut.",
    apiRejected: "Die Claude-API hat die Anfrage abgelehnt ({status}).",
    apiAborted: "Die Claude-API hat die Antwort abgebrochen: {detail}",
    refusal: "Claude hat diesen Auftrag abgelehnt. Formuliere ihn anders.",
    tooLarge: "Das Werkzeug ist für eine einzelne Antwort zu gross geworden. Teile den Auftrag in kleinere Schritte.",
    unreadable: "Die Antwort von Claude liess sich nicht lesen. Versuche es erneut.",
    toolTooNew: "Dieses Werkzeug stammt von einer neueren Fassung von Mothership. Aktualisiere das Plugin, um es zu öffnen.",
    unknownFunction: "Das Werkzeug kennt die Funktion «{name}» nicht.",
    notReady: "InDesign ist noch nicht bereit. Lade das Werkzeug in einem Moment neu.",
  },
  en: {
    settings: "Settings",
    apiKey: "Claude API key",
    model: "Model",
    save: "Save",
    toolFolder: "Tool folder",
    defaultFolder: "Default folder",
    chooseFolder: "Choose folder",
    promptPlaceholder:
      "Which tool do you need? For example: show all paragraph styles as bars by frequency and let me select one in the document with a click.",
    build: "Build tool",
    shelf: "‹ Shelf",
    history: "History",
    tool: "Tool",
    reload: "Reload",
    changePlaceholder: "What should change about this tool?",
    change: "Change",
    emptyShelf: "No tools yet. Describe below what you need.",
    deleteTool: "Delete tool",
    cancel: "Cancel",
    delete: "Delete",
    emptyLog: "No request has been recorded for this tool yet.",
    created: "created",
    changed: "changed",
    errorGoesAlong: "The error is passed to Claude with your next “Change”.",
    hostLoadFailed: "host_js could not be loaded: {detail}",
    openFailed: "The tool could not be opened: {detail}",
    uiError: "Interface: {detail}",
    describeFirst: "Describe what you need first.",
    phaseWaiting: "Claude is reading the request",
    phaseThinking: "Claude is thinking",
    phaseWriting: "Claude is writing the tool",
    phaseDone: "Claude is done",
    built: "Built in {seconds} s",
    settingsSaved: "Settings saved.",
    folderNow: "The tools are now stored in “{path}”.",
    folderCopied: "{count} existing tools were copied there.",
    folderUnusable: "The folder cannot be used: {detail}",
    folderReset: "The tools are stored in the plugin's data folder again. The previous folder is unchanged.",
    folderUnreachable:
      "The tool folder “{path}” cannot be reached. Check that it still exists and Google Drive is running, or choose it again in the settings.",
    modelSonnet: "{name} (faster, cheaper)",
    modelFable: "{name} (most capable, more expensive)",
    noKey: "No API key is stored. Enter it in the settings.",
    apiUnreachable: "The Claude API cannot be reached: {detail}",
    keyRejected: "The API key was rejected. Check it in the settings.",
    rateLimit: "The API account's limit is reached. Try again in a minute.",
    overloaded: "The Claude API is overloaded or having problems ({status}). Try again.",
    apiRejected: "The Claude API rejected the request ({status}).",
    apiAborted: "The Claude API aborted the response: {detail}",
    refusal: "Claude declined this request. Try phrasing it differently.",
    tooLarge: "The tool has grown too large for a single response. Split the request into smaller steps.",
    unreadable: "Claude's response could not be read. Try again.",
    toolTooNew: "This tool was made with a newer version of Mothership. Update the plugin to open it.",
    unknownFunction: "The tool has no function “{name}”.",
    notReady: "InDesign is not ready yet. Reload the tool in a moment.",
  },
};

function detect() {
  try {
    // Sprache der InDesign-Oberfläche, etwa «de_DE»; alles ausser Deutsch wird englisch.
    return /^de/i.test(require("uxp").host.uiLocale) ? "de" : "en";
  } catch (error) {
    return "en";
  }
}

/** Sprache des Bedienfelds: `de` bei deutscher InDesign-Oberfläche, sonst `en`. */
const language = detect();

/**
 * Liefert einen Text der Oberfläche in der Sprache des Bedienfelds.
 * @param {string} key Schlüssel aus `TEXTS`
 * @param {Object<string, string|number>} [values] Werte für Platzhalter wie `{name}`
 * @returns {string}
 */
function t(key, values = {}) {
  return TEXTS[language][key].replace(/\{(\w+)\}/g, (match, name) => String(values[name]));
}

module.exports = { language, t, TEXTS };
