<!DOCTYPE html>
<html>
<head>
  <title>Send Task to Heroku</title>
</head>
<body>
  <input type="text" id="userInput" placeholder="Enter your task..." onkeypress="handleKeyPress(event)" />
  <button onclick="sendTask()">Send Task</button>

  <script>
    function handleKeyPress(event) {
      if (event.key === "Enter") sendTask();
    }

    async function sendTask() {
      const userMessage = document.getElementById("userInput").value.trim();
      if (!userMessage) return;

      console.log("Sending POST request to Heroku app...");

      try {
        const response = await fetch("https://dry-garden-99647-4f7890081fda.herokuapp.com/process", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            task: userMessage,
            task_name: "example_task"
          })
        });

        const data = await response.json();
        console.log("Response:", data);
      } catch (error) {
        console.error("Error:", error);
      }

      document.getElementById("userInput").value = "";
    }
  </script>
</body>
</html>
