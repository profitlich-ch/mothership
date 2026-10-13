// Brücke zwischen Werkzeug (Webview) und Plugin. Wird beim Speichern in jede ui.html eingesetzt.
(function () {
  const pending = new Map();
  let sequence = 0;

  function send(message) {
    if (!window.uxpHost) return;
    window.uxpHost.postMessage(Object.assign({ pirate: 1 }, message));
  }

  function call(mode, name, args) {
    return new Promise(function (resolve, reject) {
      const id = ++sequence;
      pending.set(id, { resolve: resolve, reject: reject });
      send({ kind: "call", id: id, mode: mode, name: name, args: args === undefined ? null : args });
    });
  }

  window.addEventListener("message", function (event) {
    let message = event.data;
    // Je nach UXP-Version kommt die Nachricht als Objekt oder als JSON-Text an.
    if (typeof message === "string") {
      try {
        message = JSON.parse(message);
      } catch (error) {
        return;
      }
    }
    if (!message || message.pirate !== 1) return;

    if (message.kind === "theme") {
      document.documentElement.setAttribute("data-theme", message.theme);
      return;
    }
    if (message.kind === "result" && pending.has(message.id)) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.ok) entry.resolve(message.value);
      else entry.reject(new Error(message.error));
    }
  });

  window.pirate = {
    read: function (name, args) {
      return call("read", name, args);
    },
    change: function (name, args) {
      return call("change", name, args);
    },
  };

  window.addEventListener("error", function (event) {
    send({ kind: "error", message: event.message + " (Zeile " + event.lineno + ")" });
  });
  window.addEventListener("unhandledrejection", function (event) {
    const reason = event.reason;
    send({ kind: "error", message: String((reason && reason.message) || reason) });
  });

  send({ kind: "ready" });
})();
