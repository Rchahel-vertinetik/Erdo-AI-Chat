let isProcessing = false;

const INITIAL_SUGGESTIONS = [
  "Show me diseased trees?",
  "List all species of trees?",
  "Show me the tallest tree?",
  "How many trees are there?"
];

// Track whether suggestions should be visible
let suggestionsVisible = true;

// --- Streaming helpers ---
function safeJsonParse(line) {
  try { return JSON.parse(line); } catch { return null; }
}

function appendBotText(el, text) {
  // Keep it safe + simple
  el.textContent += text;
  const chatbox = document.getElementById("messages");
  if (chatbox) chatbox.scrollTop = chatbox.scrollHeight;
}

function setBotText(el, text) {
  el.textContent = text;
  const chatbox = document.getElementById("messages");
  if (chatbox) chatbox.scrollTop = chatbox.scrollHeight;
}

function ensureLogPanel(botMessageElement) {
  // Optional: show a small log area inside the bot message for progress updates
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
    panel.style.display = "none"; // hidden until we get logs
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
  panel.textContent += (panel.textContent ? "\n" : "") + line;
  const chatbox = document.getElementById("messages");
  if (chatbox) chatbox.scrollTop = chatbox.scrollHeight;
}

window.onload = () => {
  const input = document.getElementById("userInput");
  if (input) input.focus();

  // Wire up the Show/Hide suggestions icon
  const toggleBtn = document.getElementById("toggleSuggestions");
  if (toggleBtn) {
    toggleBtn.onclick = () => {
      suggestionsVisible = !suggestionsVisible;
      if (suggestionsVisible) {
        updateSuggestions(INITIAL_SUGGESTIONS);
      } else {
        updateSuggestions([]);
      }
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

/**
 * Reads NDJSON from a fetch Response body and returns:
 * - finalJson: last JSON object that contains final "message"/"response" etc.
 * - logs: array of log/progress lines (if any)
 *
 * Expected streaming formats supported:
 *  1) NDJSON: {"type":"log","message":"..."}\n {"type":"final", ...}\n
 *  2) NDJSON: {"status":"progress","message":"..."}\n {"status":"completed", ...}\n
 *  3) Plain text stream (fallback): just append as text
 */
async function readStreamedResponse(response, botMessageElement, spinner) {
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  const isNdjson =
    contentType.includes("application/x-ndjson") ||
    contentType.includes("application/ndjson") ||
    contentType.includes("text/event-stream"); // some APIs misuse SSE for NDJSON-ish

  const logPanel = ensureLogPanel(botMessageElement);

  // If there's no stream, just parse json normally
  if (!response.body || !response.body.getReader) {
    const data = await response.json();
    return { finalJson: data, logs: [] };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let finalJson = null;
  let gotAnyChunk = false;

  // Make sure bot bubble starts empty text (spinner still visible)
  setBotText(botMessageElement, "");
  if (spinner) botMessageElement.appendChild(spinner);

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    gotAnyChunk = true;
    buffer += decoder.decode(value, { stream: true });

    // NDJSON-style: split on newlines
    if (isNdjson) {
      let lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || ""; // keep incomplete tail

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const obj = safeJsonParse(trimmed);
        if (!obj) {
          // Not JSON; treat as log text
          appendLog(logPanel, trimmed);
          continue;
        }

        // --- Heuristics to classify events ---
        const type = (obj.type || obj.status || obj.event || "").toString().toLowerCase();

        const isFinal =
          type === "final" ||
          type === "completed" ||
          obj.status === "completed" ||
          obj.done === true;

        const isLog =
          type === "log" ||
          type === "progress" ||
          obj.status === "progress" ||
          obj.message && !isFinal;

        if (isFinal) {
          finalJson = obj;
          // Don't spam the user with raw JSON. We'll render final message below.
        } else if (isLog) {
          // Prefer message-ish fields
          const msg =
            obj.message ??
            obj.detail ??
            obj.text ??
            JSON.stringify(obj);

          appendLog(logPanel, String(msg));
        } else {
          // Unknown event: log it quietly in panel
          appendLog(logPanel, JSON.stringify(obj));
        }
      }
    } else {
      // Non-NDJSON: stream plain text to chat bubble
      // (You said you want stream + logs; if server doesn't send NDJSON,
      // we show the stream as the main bot text)
      appendBotText(botMessageElement, buffer);
      buffer = "";
    }
  }

  // Flush any remaining buffer
  const tail = buffer.trim();
  if (tail && isNdjson) {
    const obj = safeJsonParse(tail);
    if (obj) finalJson = obj;
    else appendLog(logPanel, tail);
  } else if (tail && !isNdjson) {
    appendBotText(botMessageElement, tail);
  }

  // Remove spinner if present
  if (spinner && spinner.parentNode) spinner.parentNode.removeChild(spinner);

  // If we never got any chunks but response is ok, fallback to json
  if (!gotAnyChunk) {
    const data = await response.json();
    return { finalJson: data, logs: [] };
  }

  return { finalJson, logs: [] };
}

async function pollJobStatus(jobId, apiBaseUrl, botMessageElement, spinner) {
  // Poll /status/{job_id} until completed/failed.
  // This is only used if backend returns {status:"queued", job_id:...}
  const statusUrl = apiBaseUrl.replace(/\/process$/, "") + `/status/${encodeURIComponent(jobId)}`;
  const logPanel = ensureLogPanel(botMessageElement);

  const maxMs = 1000 * 60 * 15; // 15 min safeguard
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
    const message = data.message || "";

    // Update log panel with status changes (quiet, not spammy)
    if (status && status !== lastStatus) {
      lastStatus = status;
      appendLog(logPanel, `Status: ${status}`);
    }
    if (message) appendLog(logPanel, message);

    if (status === "completed") {
      if (spinner && spinner.parentNode) spinner.parentNode.removeChild(spinner);

      const reply =
        (data.result && (data.result.message || data.result.response)) ||
        data.message ||
        data.response ||
        "Completed.";

      setBotText(botMessageElement, reply);

      // Suggestions (if any)
      const suggestions = data.prompt_options || [];
      if (suggestions.length > 0) {
        suggestionsVisible = true;
        updateSuggestions(suggestions);
      } else if (!suggestionsVisible) {
        updateSuggestions([]);
      }
      syncToggleButton();
      return;
    }

    if (status === "failed") {
      if (spinner && spinner.parentNode) spinner.parentNode.removeChild(spinner);

      const err =
        data.error ||
        data.message ||
        "Job failed.";

      setBotText(botMessageElement, `Error: ${err}`);
      updateSuggestions([]);
      return;
    }

    // wait before next poll
    await new Promise((res) => setTimeout(res, 1200));
  }
}

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
      // Important: if backend supports streaming NDJSON, it should return that content-type
      body: JSON.stringify({ task: userMessage, task_name: taskName })
    });

    // If backend returns error code, try to parse body for message
    if (!response.ok) {
      let errText = `HTTP ${response.status}`;
      try {
        const maybeJson = await response.json();
        errText = maybeJson.detail || maybeJson.message || JSON.stringify(maybeJson);
      } catch {
        try { errText = await response.text(); } catch {}
      }
      if (spinner && spinner.parentNode) spinner.parentNode.removeChild(spinner);
      botMessageElement.innerText = `Error: ${errText}`;
      updateSuggestions([]);
      return;
    }

    // --- STREAMING READ (if response is streamed) ---
    const { finalJson } = await readStreamedResponse(response, botMessageElement, spinner);

    // If we got a final JSON object, render it nicely (don’t show raw JSON)
    if (finalJson) {
      // If backend indicates queued, poll status
      if ((finalJson.status || "").toLowerCase() === "queued" && finalJson.job_id) {
        // Keep spinner while polling
        if (!spinner.parentNode) botMessageElement.appendChild(spinner);
        await pollJobStatus(finalJson.job_id, apiUrl, botMessageElement, spinner);
        return;
      }

      const reply =
        finalJson.message ??
        finalJson.response ??
        (finalJson.result && (finalJson.result.message || finalJson.result.response)) ??
        JSON.stringify(finalJson);

      setBotText(botMessageElement, reply);

      // Suggestions
      const suggestions = finalJson.prompt_options || [];
      if (suggestions.length > 0) {
        suggestionsVisible = true;
        updateSuggestions(suggestions);
      } else if (!suggestionsVisible) {
        updateSuggestions([]);
      }
      syncToggleButton();
      return;
    }

    // If we streamed plain text (non-NDJSON) then the bot text already updated.
    // We won't have suggestions in that case unless your server embeds them in-stream.

  } catch (error) {
    console.error("Error:", error);
    if (spinner && spinner.parentNode) spinner.parentNode.removeChild(spinner);
    botMessageElement.innerText = `Error: ${error.message}`;
    updateSuggestions([]);
  } finally {
    isProcessing = false;
    inputField.value = "";
    inputField.disabled = false;
    inputField.focus();
  }
}

function addMessage(message, sender) {
  const chatbox = document.getElementById("messages");
  const msgDiv = document.createElement("div");
  msgDiv.className = sender;
  msgDiv.innerText = message; // innerText is safer than innerHTML
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
