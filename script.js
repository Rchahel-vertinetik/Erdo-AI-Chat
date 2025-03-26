function handleKeyPress(event) {
  if (event.key === "Enter") sendTask();
}

function getTaskNameFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get("task_name") || "default_task";
}

async function sendTask() {
  const userMessage = document.getElementById("userInput").value.trim();
  if (!userMessage) return;

  const taskName = getTaskNameFromURL();
  addMessage(userMessage, "user");
  console.log("Sending POST request to Heroku app with task_name:", taskName);

  try {
    const response = await fetch("https://dry-garden-99647-4f7890081fda.herokuapp.com/process", {
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
    const reply = data.message || JSON.stringify(data);
    addMessage(reply, "bot");
  } catch (error) {
    console.error("Error:", error);
    addMessage("Failed to reach the server.", "bot");
  }

  document.getElementById("userInput").value = "";
}

function addMessage(message, sender) {
  const chatbox = document.getElementById("messages");
  const msgDiv = document.createElement("div");
  msgDiv.className = sender;
  msgDiv.textContent = message;
  chatbox.appendChild(msgDiv);
  chatbox.scrollTop = chatbox.scrollHeight;
}
