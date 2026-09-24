(function () {
  var timeoutMs = 20000;
  var mounted = false;
  var failed = false;
  var diagnostic = null;

  function showFailure(reason) {
    if (failed) return;
    failed = true;
    diagnostic = {
      name: reason && reason.name ? String(reason.name) : "StartupError",
      message: reason && reason.message ? String(reason.message) : String(reason),
    };
    console.error("Xprite startup failed", diagnostic);
    var root = document.getElementById("root");
    if (!root) return;
    root.textContent = "";
    var screen = document.createElement("div");
    screen.className = "minitool-bootstrap";
    screen.setAttribute("role", "alert");
    var panel = document.createElement("div");
    panel.className = "minitool-bootstrap-panel";
    var heading = document.createElement("h1");
    heading.textContent = "无法打开 Xprite";
    var message = document.createElement("p");
    message.textContent = "请关闭预览后重新打开。如果仍然无法启动，请反馈此画面。";
    var code = document.createElement("p");
    code.textContent = "启动错误：" + diagnostic.name + " · " + diagnostic.message.slice(0, 220);
    panel.appendChild(heading);
    panel.appendChild(message);
    panel.appendChild(code);
    screen.appendChild(panel);
    root.appendChild(screen);
  }

  var timer = setTimeout(function () {
    if (!mounted) showFailure(new Error("Startup timed out"));
  }, timeoutMs);
  window.addEventListener("error", function (event) {
    if (!document.querySelector(".xse-editor-window"))
      showFailure(event.error || new Error(event.message || "Startup script failed"));
  });
  window.addEventListener("unhandledrejection", function (event) {
    if (!document.querySelector(".xse-editor-window")) showFailure(event.reason);
  });
  window.addEventListener("xprite-minitool-mounted", function () {
    mounted = true;
    clearTimeout(timer);
  });
  window.xpriteMiniToolStartupDiagnostic = function () {
    return diagnostic;
  };
})();
