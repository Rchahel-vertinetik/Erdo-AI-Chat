let isProcessing = false;

window.onload = () => {
  const input = document.getElementById("userInput");
  if (input) input.focus();
};

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

  // Hide any old suggestions when starting a new request
  updateSuggestions([]);

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

    // Update suggestions if backend sent them
    const suggestions = data.prompt_options || [];
    updateSuggestions(suggestions);

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
  updateSuggestions([]); // also clear suggestion chips
}

function sendClearMap() {
  document.getElementById("userInput").value = "clean map";
  sendTask();
}

// Compact suggestions with hide control
function updateSuggestions(suggestions) {
  const container = document.getElementById("suggestions");
  if (!container) return;

  container.innerHTML = "";

  // No suggestions → hide immediately
  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    container.style.display = "none";
    return;
  }

  // Small horizontal row
  container.style.display = "flex";

  suggestions.forEach((text) => {
    const chip = document.createElement("button");
    chip.className = "suggestion-chip";
    chip.type = "button";
    chip.innerText = text;

    chip.onclick = () => {
      const input = document.getElementById("userInput");
      if (!input) return;

      input.value = text;
      input.focus();

      // Auto hide all suggestions after click
      container.style.display = "none";
    };

    container.appendChild(chip);
  });

  // Small "X" hide control on the right
  const hide = document.createElement("button");
  hide.className = "suggestions-hide";
  hide.type = "button";
  hide.innerText = "×";
  hide.title = "Hide suggestions";
  hide.onclick = () => {
    container.style.display = "none";
  };

  container.appendChild(hide);
}
