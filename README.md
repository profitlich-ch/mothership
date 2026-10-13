# AI Pirate

Ein InDesign-Bedienfeld, das mit Claude eigene Werkzeuge baut: Du beschreibst, was Du brauchst, und erhältst ein Werkzeug mit grafischer Oberfläche, das Inhalte des Dokuments zeigt und verändert. Werkzeuge bleiben im Regal und lassen sich jederzeit weiter anpassen.

Läuft ab InDesign 2026 (21.0) als UXP-Plugin. Es braucht einen eigenen Claude-API-Key von [console.anthropic.com](https://console.anthropic.com); abgerechnet wird pro Aufruf über dieses Konto.

## Installieren

Es gibt zwei Wege. Zum Ausprobieren und Entwickeln den ersten, für den Alltag den zweiten.

### Aus dem Ordner laden (Entwicklung)

1. In der Creative-Cloud-App unter «Applikationen» das **UXP Developer Tool** installieren und starten. Beim ersten Start verlangt es das Administratorkennwort, um den Entwicklermodus einzuschalten.
2. InDesign starten.
3. Im Developer Tool **Add Plugin** wählen und `plugin/manifest.json` aus diesem Ordner öffnen.
4. In der Zeile «AI Pirate» auf **Load** klicken. Das Bedienfeld erscheint in InDesign; später findest Du es im Menü «Zusatzmodule».
5. Im Bedienfeld unter **Einstellungen** den API-Key eintragen und speichern.

Ein so geladenes Plugin verschwindet beim Beenden von InDesign und wird nach dem nächsten Start wieder mit **Load** geladen. Nach einer Änderung am Code genügt **Reload** in derselben Zeile; **Debug** öffnet die Konsole mit den Fehlermeldungen.

### Als Paket installieren (Alltag)

1. Im Developer Tool in der Zeile «AI Pirate» über das Menü «•••» **Package** wählen. Es entsteht eine `.ccx`-Datei.
2. Die `.ccx`-Datei doppelklicken. Die Creative-Cloud-App installiert sie und warnt dabei, dass das Plugin nicht aus dem Marketplace stammt.
3. InDesign neu starten. Das Bedienfeld steht jetzt bei jedem Start im Menü «Zusatzmodule» bereit, ohne Developer Tool.

Das Plugin ist nirgends registriert: Die ID `ch.profitlich.ai-pirate` in `plugin/manifest.json` ist selbst gewählt. Eine ID von Adobe braucht es nur für den Marketplace.

## Aktualisieren

1. `version` in `plugin/manifest.json` erhöhen.
2. Wie oben ein neues Paket erzeugen und doppelklicken; es ersetzt die installierte Fassung.
3. InDesign neu starten.

Die Werkzeuge liegen nicht im Plugin, sondern in dessen Datenordner, und überstehen die Aktualisierung. Der Pfad steht im Bedienfeld unter **Einstellungen → Werkzeugordner**. Das aus dem Ordner geladene und das als Paket installierte Plugin führen je einen eigenen Datenordner.

## Benutzen

- **Regal:** Liste der Werkzeuge mit einer von Claude geschriebenen Kurzbeschreibung. Ein Klick auf die Zeile öffnet das Werkzeug, der Papierkorb löscht es nach einer Rückfrage. Unten beschreibst Du ein neues und klickst **Werkzeug bauen**. Claude erhält dazu eine Beschreibung des geöffneten Dokuments (Formate, Ebenen, Farbfelder, Auswahl), aber keinen Inhalt.
- **Werkzeug:** Die Oberfläche des Werkzeugs füllt das Bedienfeld. Darunter beschreibst Du, was sich ändern soll, und klickst **Ändern**. Fehler, die das Werkzeug im Betrieb meldet, gehen dabei automatisch an Claude mit.
- **Verlauf:** zeigt alle Aufträge, mit denen das Werkzeug erstellt und geändert wurde, im Wortlaut. Während des Bauens zeigt die Statuszeile Dauer und verbrauchte Tokens.
- **Rückgängig:** Jede Änderung eines Werkzeugs am Dokument ist ein Schritt im InDesign-Menü «Bearbeiten → Rückgängig».
- Erzeugter Code wird ohne Rückfrage ausgeführt. Arbeite an Dokumenten, die gesichert sind.

## Aufbau

```txt
plugin/
  manifest.json      Berechtigungen: Netz nur zu api.anthropic.com, lokale Webview, Code aus Text
  index.html, .js    Bedienfeld: Regal, Werkzeugansicht, Einstellungen
  src/claude.js      Anfrage an die Claude-API, API-Key im sicheren Speicher von UXP
  src/tools.js       Werkzeuge im Datenordner lesen, schreiben, löschen
  src/host.js        host_js ausführen, Dokument beschreiben
  kit/               Was jedes Werkzeug mitbekommt: Grundgerüst (kit.css), Brücke (bridge.js)
                     und der Anweisungstext für Claude (system-prompt.md)
```

Ein Werkzeug ist ein Ordner mit fünf Dateien:

| Datei | Inhalt |
| --- | --- |
| `meta.json` | Name, Beschreibung, Änderungsdatum |
| `ui.src.html` | Oberfläche, wie Claude sie geliefert hat |
| `ui.html` | dieselbe Oberfläche mit eingesetztem Grundgerüst und Brücke; sie wird angezeigt |
| `host.js` | Funktionen mit Zugriff auf das Dokument |
| `log.json` | alle Aufträge im Wortlaut, mit Zeitpunkt und Tokens |

Die Oberfläche läuft in einer Webview, also in einem echten Browser ohne Zugriff auf InDesign. Sie ruft über `pirate.read(name, args)` und `pirate.change(name, args)` Funktionen aus `host.js` auf; nur `change` erzeugt einen Rückgängig-Schritt. Was Claude über dieses Format weiss, steht in `plugin/kit/system-prompt.md` – dort wird nachgeschärft, wenn Werkzeuge wiederholt denselben Fehler machen.
