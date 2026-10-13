# Mothership

*The mother of all plugins.*

An InDesign panel that uses Claude to build your own tools: you describe what you need and get a tool with a graphical interface that shows and changes content in your document. Tools stay on a shelf and can be refined at any time.

Runs as a UXP plugin in InDesign 2026 (21.0) and later. The panel is German when InDesign's interface is German and English otherwise. You need your own Claude API key from [console.anthropic.com](https://console.anthropic.com); usage is billed per request to that account.

> **Generated code runs without confirmation.** A tool that Claude builds can change your document as soon as you use it. Work on documents that are saved or backed up.

## Install

There are two ways. Use the first to try the plugin or develop it, the second for daily work.

### Load from the folder (development)

1. In the Creative Cloud app, install the **UXP Developer Tool** and start it. On first launch it asks for the administrator password to enable developer mode.
2. Start InDesign.
3. In the Developer Tool, choose **Add Plugin** and open `plugin/manifest.json` from this repository.
4. Click **Load** in the "Mothership" row. The panel appears in InDesign; later you find it in the Plugins menu.
5. In the panel, open **Settings**, enter your API key and save.

A plugin loaded this way disappears when InDesign quits and has to be loaded again with **Load** after the next start. After a code change, **Reload** in the same row is enough; after a change to `manifest.json`, use **Unload** and then **Load**. **Debug** opens the console with error messages.

### Install as a package (daily use)

1. In the Developer Tool, open the "•••" menu in the "Mothership" row and choose **Package**. This creates a `.ccx` file.
2. Double-click the `.ccx` file. The Creative Cloud app installs it and warns that the plugin does not come from the Marketplace.
3. Restart InDesign. The panel is now available in the Plugins menu on every start, without the Developer Tool.

The plugin is not registered anywhere: the ID `ch.profitlich.mothership` in `plugin/manifest.json` is self-chosen. An ID from Adobe is only required for the Marketplace.

## Update

1. Increase `version` in `plugin/manifest.json`.
2. Create a new package as above and double-click it; it replaces the installed version.
3. Restart InDesign.

Tools are not stored inside the plugin and survive the update; see *Tool folder*.

## Tool folder

By default, tools are stored in the plugin's data folder. That folder is tied to this computer, the InDesign major version and the kind of installation: the plugin loaded from the folder and the one installed as a package each have their own.

With **Settings → Choose folder** you store the tools in a folder of your own instead, for example in Google Drive. The plugin then reads and writes only there, and Google Drive for desktop syncs between computers. On every other computer, choose the same folder.

- When you choose a folder, your existing tools are copied into it unless they are already there. The old location stays unchanged.
- **Default folder** switches back to the plugin's data folder without copying or deleting anything.
- If the chosen folder cannot be reached, the shelf says so and stays empty instead of silently working somewhere else.
- Mark the folder as available offline in Google Drive; otherwise tools that exist only in the cloud are missing when you are offline.
- The API key is never stored in the tool folder. It stays in the secure storage of each computer.

## Use

- **Shelf:** the list of tools, each with a short description written by Claude. Clicking a row opens the tool; the trash icon deletes it after a confirmation. Below the list you describe a new tool and click **Build tool**. Claude receives a description of the open document (styles, layers, swatches, selection) but none of its content.
- **Tool:** the tool's interface fills the panel. Below it you describe what should change and click **Change**. Errors the tool reported while running are passed to Claude automatically.
- **History:** shows every request that created or changed the tool, word for word. While a tool is being built, the status line shows the elapsed time and the tokens used.
- **Undo:** every change a tool makes to the document is one step in InDesign's Edit → Undo.
- **Language:** new tools are built in the language of the panel. Existing tools keep their language until you ask for a change.

## Structure

```txt
plugin/
  manifest.json      Permissions: network only to api.anthropic.com, local webview, code from strings,
                     folder access after the user picks one
  index.html, .js    Panel: shelf, tool view, settings
  src/claude.js      Request to the Claude API, API key in UXP secure storage
  src/tools.js       Read, write and delete tools in the tool folder
  src/host.js        Run host_js, describe the document
  src/i18n.js        Interface texts in German and English
  kit/               What every tool receives: base stylesheet (kit.css), bridge (bridge.js)
                     and the instructions for Claude (system-prompt.md)
```

A tool is a folder with four files:

| File | Content |
| --- | --- |
| `meta.json` | Name, description, date of last change, format number |
| `ui.src.html` | The interface as Claude delivered it |
| `host.js` | Functions with access to the document |
| `log.json` | Every request word for word, with time and tokens |

When a tool is opened, the plugin inserts the base stylesheet and the bridge into the interface and writes the result as `ui.html` to its data folder, because the webview can only load from there. That file is a cache and is regenerated on every open.

The format number says how the tool folder is laid out. When the layout changes, the number in `FORMAT` (`plugin/src/tools.js`) goes up and `UPGRADES` gets one step that converts a folder from the previous number. A tool is upgraded when it is opened, step by step from whatever number it has. A plugin that meets a tool with a higher number than its own shows it greyed out in the shelf and asks for an update instead of opening it, which matters when several computers with different plugin versions share one tool folder.

The interface runs in a webview, a real browser with no access to InDesign. It calls functions from `host.js` through `pirate.read(name, args)` and `pirate.change(name, args)`; only `change` creates an undo step. Everything Claude knows about this format is in `plugin/kit/system-prompt.md`, which is the place to sharpen when tools repeat the same mistake.

## License

[MIT](LICENSE)
