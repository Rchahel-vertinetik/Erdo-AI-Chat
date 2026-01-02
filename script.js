let isProcessing = false;

const INITIAL_SUGGESTIONS = [
  "Show me diseased trees?",
  "List all species of trees?",
  "Show me the tallest tree?",
  "How many trees are there?"
];

let suggestionsVisible = true;

// ---------------- Helpers ----------------
function safeJsonParse(line) {
  try { return JSON.parse(line); } catch { return null; }
}

function setBotText(el, text) {
  el.textContent = text ?? "";
  const chatbox = document.getElementById("messages");
  if (chatbox) chatbox.scrollTop = chatbox.scrollHeight;
}

function appendBotText(el, text) {
  el.textContent += text ?? "";
  const chatbox = document.getElementById("messages");
  if (chatbox) chatbox.scrollTop = chatbox.scrollHeight;
}

function ensureLogPanel(botMessageElement) {
  let panel = botMessageElement.querySelector(".bot-log-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.className = "bot-log-panel";
    panel.style.marginTop = "8px";
    panel.style.padding = "8px";
    panel.style.borderRadius = "10px";
    panel.style.background = "rgba(255,255,255,0.06)";
    panel.style.border = "1px solid rgba(255,255,255,0.10)";
    panel.style.fontSize = "12px";
    panel.style.lineHeight = "1.35";
    panel.style.whiteSpace = "pre-wrap";
    panel.style.display = "none";
    botMessageElement.appendChild(panel);
  }
  return panel;
}

function showLog(panel) {
  if (panel) panel.style.display = "block";
}

function appendLog(panel, line) {
  if (!panel) return;
  showLog(panel);
  panel.textContent += (panel.textContent ? "\n" : "") + String(line);
  const chatbox = document.getElementById("messages");
  if (chatbox) chatbox.scrollTop = chatbox.scrollHeight;
}

// Extract a user-friendly reply from any backend payload without dumping JSON
function extractReply(payload) {
  if (!payload) return "";
  if (typeof payload.message === "string" && payload.message.trim()) return payload.message.trim();
  if (typeof payload.response === "string" && payload.response.trim()) return payload.response.trim();
  if (payload.result) {
    if (typeof payload.result.message === "string" && payload.result.message.trim()) return payload.result.message.trim();
    if (typeof payload.result.response === "string" && payload.result.response.trim()) return payload.result.response.trim();
  }
  return "Done.";
}

function applySuggestionsFrom(payload) {
  const suggestions = payload?.prompt_options || [];
  if (Array.isArray(suggestions) && suggestions.length > 0) {
    suggestionsVisible = true;
    updateSuggestions(suggestions);
  } else if (!suggestionsVisible) {
    updateSuggestions([]);
  }
  syncToggleButton();
}

function renderBotResult(botMessageElement, payload) {
  setBotText(botMessageElement, extractReply(payload));
  applySuggestionsFrom(payload);
}

// ---------------- UI init ----------------
window.onload = () => {
  const input = document.getElementById("userInput");
  if (input) input.focus();

  const toggleBtn = document.getElementById("toggleSuggestions");
  if (toggleBtn) {
    toggleBtn.onclick = () => {
      suggestionsVisible = !suggestionsVisible;
      updateSuggestions(suggestionsVisible ? INITIAL_SUGGESTIONS : []);
      syncToggleButton();
    };
    syncToggleButton();
  }

  updateSuggestions(INITIAL_SUGGESTIONS);
};

function syncToggleButton() {
  const toggleBtn = document.getElementById("toggleSuggestions");
  if (!toggleBtn) return;
  toggleBtn.innerText = suggestionsVisible ? "× Hide" : "＋ Show";
}

function handleKeyPress(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendTask();
  }
}

function getTaskNameFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get("task_name") || "default_task";
}

function isDevMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get("dev") === "true";
}

function getApiUrl() {
  return isDevMode()
    ? "https://llmgeo-dev-1042524106019.us-central1.run.app/process"
    : "https://llmgeo-1042524106019.us-central1.run.app/process";
}

function apiBaseFromProcessUrl(processUrl) {
  return processUrl.replace(/\/process$/, "");
}

// ---------------- Stream reader (FIXED) ----------------
async function readStreamedResponse(response, botMessageElement, spinner) {
  const contentType = (response.headers.get("content-type") || "").toLowerCase();

  // NDJSON / SSE-like progress
  const isNdjson =
    contentType.includes("application/x-ndjson") ||
    contentType.includes("application/ndjson") ||
    contentType.includes("text/event-stream");

  const logPanel = ensureLogPanel(botMessageElement);

  // If there is no streaming reader (rare), attempt json then text
  if (!response.body || !response.body.getReader) {
    try {
      const data = await response.json();
      return { finalJson: data };
    } catch {
      const t = await response.text();
      const obj = safeJsonParse(t.trim());
      return { finalJson: obj, rawText: t };
    }
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let finalJson = null;
  let plainTextAll = ""; // <-- key: buffer ALL non-NDJSON text

  // Reset bot text but keep spinner
  setBotText(botMessageElement, "");
  if (spinner && !spinner.parentNode) botMessageElement.appendChild(spinner);

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });

    if (isNdjson) {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const obj = safeJsonParse(trimmed);
        if (!obj) {
          appendLog(logPanel, trimmed);
          continue;
        }

        const type = (obj.type || obj.status || obj.event || "").toString().toLowerCase();
        const isFinal =
          type === "final" ||
          type === "completed" ||
          obj.status === "completed" ||
          obj.done === true;

        const isLog =
          type === "log" ||
          type === "progress" ||
          obj.status === "progress";

        if (isFinal) {
          finalJson = obj;
        } else if (isLog) {
          const msg = obj.message ?? obj.detail ?? obj.text ?? "";
          if (msg) appendLog(logPanel, msg);
        }
      }
    } else {
      // IMPORTANT FIX:
      // Do NOT print raw JSON text to user while streaming.
      // Accumulate it, and at the end try JSON.parse().
      plainTextAll += chunk;
    }
  }

  // Flush tail for NDJSON
  if (isNdjson) {
    const tail = buffer.trim();
    if (tail) {
      const obj = safeJsonParse(tail);
      if (obj) finalJson = obj;
      else appendLog(logPanel, tail);
    }
  } else {
    // For non-NDJSON: parse full body as JSON if possible
    const t = plainTextAll.trim();
    const obj = safeJsonParse(t);
    if (obj) {
      finalJson = obj;
    } else {
      // If it truly is plain text, show it
      // (This prevents blank output if server returns text)
      setBotText(botMessageElement, t || "Done.");
    }
  }

  if (spinner && spinner.parentNode) spinner.parentNode.removeChild(spinner);

  return { finalJson };
}

// ---------------- Queue polling ----------------
async function pollJobStatusByUrl(pollPath, apiProcessUrl, botMessageElement, spinner) {
  const base = apiBaseFromProcessUrl(apiProcessUrl);
  const statusUrl = base + pollPath;

  const logPanel = ensureLogPanel(botMessageElement);

  const maxMs = 1000 * 60 * 15;
  const start = Date.now();
  let lastStatus = "";

  while (true) {
    if (Date.now() - start > maxMs) {
      if (spinner && spinner.parentNode) spinner.parentNode.removeChild(spinner);
      setBotText(botMessageElement, "Timed out waiting for background job. Please try again.");
      return;
    }

    let data;
    try {
      const r = await fetch(statusUrl, { method: "GET" });
      data = await r.json();
    } catch (e) {
      appendLog(logPanel, `Status check failed: ${e.message}`);
      await new Promise((res) => setTimeout(res, 1500));
      continue;
    }

    const status = (data.status || "").toLowerCase();

    if (status && status !== lastStatus) {
      lastStatus = status;
      appendLog(logPanel, `Status: ${status}`);
    }

    if (data.message) appendLog(logPanel, data.message);

    if (status === "completed") {
      if (spinner && spinner.parentNode) spinner.parentNode.removeChild(spinner);
      renderBotResult(botMessageElement, data);
      return;
    }

    if (status === "failed") {
      if (spinner && spinner.parentNode) spinner.parentNode.removeChild(spinner);
      const err = data.error || data.message || "Job failed.";
      setBotText(botMessageElement, `Error: ${err}`);
      updateSuggestions([]);
      return;
    }

    await new Promise((res) => setTimeout(res, 1200));
  }
}

// ---------------- Main sendTask ----------------
async function sendTask() {
  if (isProcessing) return;

  const inputField = document.getElementById("userInput");
  const userMessage = inputField.value.trim();
  if (!userMessage) return;

  isProcessing = true;
  inputField.disabled = true;

  const taskName = getTaskNameFromURL();
  addMessage(userMessage, "user");

  const botMessageElement = addMessage("", "bot");
  const spinner = document.createElement("img");
  spinner.src = "assets/logo-spinner.png";
  spinner.className = "logo-spinner";
  spinner.alt = "Loading...";
  botMessageElement.appendChild(spinner);

  const apiUrl = getApiUrl();

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: userMessage, task_name: taskName })
    });

    if (!response.ok) {
      let errText = `HTTP ${response.status}`;
      try {
        const maybeJson = await response.json();
        errText = maybeJson.detail || maybeJson.message || errText;
      } catch {
        try { errText = await response.text(); } catch {}
      }
      if (spinner && spinner.parentNode) spinner.parentNode.removeChild(spinner);
      setBotText(botMessageElement, `Error: ${errText}`);
      updateSuggestions([]);
      return;
    }

    const { finalJson } = await readStreamedResponse(response, botMessageElement, spinner);

    if (finalJson) {
      const status = (finalJson.status || "").toLowerCase();

      if (status === "queued") {
        const pollPath = finalJson.poll || (finalJson.job_id ? `/status/${encodeURIComponent(finalJson.job_id)}` : null);

        // Show friendly queued message (not JSON)
        setBotText(botMessageElement, finalJson.message || "Queued. Working on it...");

        applySuggestionsFrom(finalJson);

        if (pollPath) {
          if (!spinner.parentNode) botMessageElement.appendChild(spinner);
          await pollJobStatusByUrl(pollPath, apiUrl, botMessageElement, spinner);
        }
        return;
      }

      // Completed inline / normal
      renderBotResult(botMessageElement, finalJson);
      return;
    }

    // If it was real plain text, readStreamedResponse already wrote it.

  } catch (error) {
    console.error("Error:", error);
    if (spinner && spinner.parentNode) spinner.parentNode.removeChild(spinner);
    setBotText(botMessageElement, `Error: ${error.message}`);
    updateSuggestions([]);
  } finally {
    isProcessing = false;
    inputField.value = "";
    inputField.disabled = false;
    inputField.focus();
  }
}

// ---------------- Chat UI utils ----------------
function addMessage(message, sender) {
  const chatbox = document.getElementById("messages");
  const msgDiv = document.createElement("div");
  msgDiv.className = sender;
  msgDiv.innerText = message;
  chatbox.appendChild(msgDiv);
  chatbox.scrollTop = chatbox.scrollHeight;
  return msgDiv;
}

function clearChat() {
  const chatbox = document.getElementById("messages");
  chatbox.innerHTML = "";

  suggestionsVisible = true;
  updateSuggestions(INITIAL_SUGGESTIONS);
  syncToggleButton();
}

function sendClearMap() {
  document.getElementById("userInput").value = "clean map";
  sendTask();
}

// ---------------- Suggestions ----------------
function updateSuggestions(suggestions) {
  const container = document.getElementById("suggestions");
  if (!container) return;

  container.innerHTML = "";

  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    container.style.display = "none";
    return;
  }

  container.style.display = "flex";

  suggestions.forEach((text) => {
    const chip = document.createElement("div");
    chip.className = "suggestion-chip";
    chip.innerText = text;

    chip.onclick = () => {
      const input = document.getElementById("userInput");
      if (!input) return;
      input.value = text;
      input.focus();
    };

    container.appendChild(chip);
  });

  const hide = document.createElement("div");
  hide.className = "suggestions-hide";
  hide.innerText = "× Hide";
  hide.onclick = () => {
    suggestionsVisible = false;
    updateSuggestions([]);
    syncToggleButton();
  };

  container.appendChild(hide);
}
