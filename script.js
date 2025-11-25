let isProcessing = false;

const INITIAL_SUGGESTIONS = [
  "Show me diseased trees?",
  "List all species of trees?",
  "Show me the tallest tree?",
  "How many trees are there?"
];

// Track whether suggestions should be visible
let suggestionsVisible = true;

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

    // Initial label
    syncToggleButton();
  }

  // Show your custom initial suggestions on load
  updateSuggestions(INITIAL_SUGGESTIONS);
};

function syncToggleButton() {
  const toggleBtn = document.getElementById("toggleSuggestions");
  if (!toggleBtn) return;
  // 👇 Icon-style labels
  toggleBtn.innerText = suggestionsVisible ? "× Hide" : "＋ Show";
}

function handleKeyPress(event) {
  // Allow Shift+Enter for newlines, Enter alone triggers send
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

  const apiUrl = isDevMode()
    ? "https://llmgeo-dev-1042524106019.us-central1.run.app/process" // dev endpoint
    : "https://llmgeo-1042524106019.us-central1.run.app/process";   // production

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        task: userMessage,
        task_name: taskName
      })
    });

    const data = await response.json();

    // Prefer `message`, then `response`, then raw JSON
    const reply =
      data.message ??
      data.response ??
      JSON.stringify(data);

    botMessageElement.innerText = reply;

    // Backend-sent suggestions will replace the current ones (if any)
    const suggestions = data.prompt_options || [];
    if (suggestions.length > 0) {
      suggestionsVisible = true;
      updateSuggestions(suggestions);
    } else if (!suggestionsVisible) {
      // If user has hidden suggestions, keep them hidden
      updateSuggestions([]);
    }
    syncToggleButton();

  } catch (error) {
    console.error("Error:", error);
    botMessageElement.innerText = `Error: ${error.message}`;
    updateSuggestions([]); // clear suggestions on error
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

  // Restore initial suggestions when chat is cleared
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

  // No suggestions → hide immediately
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
      // Keep suggestions visible; user can hide with the icon
    };

    container.appendChild(chip);
  });

  // Add a "hide" button on right inside the suggestions bar (optional)
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