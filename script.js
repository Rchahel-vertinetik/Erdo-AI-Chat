const arcgisUrl = "https://services-eu1.arcgis.com/8uHkpVrXUjYCyrO4/ArcGIS/rest/services/TreeCrowns_BE_Bolstone_13032025_/FeatureServer/0/queryy";
const backendUrl = "https://4i1yko9sdh.execute-api.eu-west-1.amazonaws.com/"; 
function handleKeyPress(event) {
    if (event.key === "Enter") processQuery();
}

async function processQuery() {
    let userMessage = document.getElementById("userInput").value.trim();
    if (!userMessage) return;

    addMessage(userMessage, "user");

    try {
        let response = await fetch(backendUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: userMessage })
        });

        let query = await response.json();
        if (!query || query.error) {
            addMessage("I couldn't process your request. Try again.", "bot");
            return;
        }

        fetchArcGISData(query);
    } catch (error) {
        addMessage("Error contacting the server.", "bot");
        console.error(error);
    }

    document.getElementById("userInput").value = "";
}

// Fetch ArcGIS REST API data
async function fetchArcGISData(query) {
    const arcgisUrl = "https://sampleserver6.arcgisonline.com/arcgis/rest/services/USA/MapServer/2/query";
    
    try {
        let response = await fetch(`${arcgisUrl}?${query}&f=json`);
        let data = await response.json();

        if (!data.features || data.features.length === 0) {
            addMessage("No matching features found.", "bot");
            return;
        }

        processResults(data.features);
    } catch (error) {
        addMessage("Error fetching ArcGIS data.", "bot");
        console.error(error);
    }
}

// Process ArcGIS results
function processResults(features) {
    let featureIDs = features.map(f => f.attributes.OBJECTID);
    addMessage(`Found ${features.length} features. IDs: ${featureIDs.join(", ")}`, "bot");
}

// Display chat messages
function addMessage(message, sender) {
    let chatbox = document.getElementById("messages");
    let msgDiv = document.createElement("div");
    msgDiv.className = sender;
    msgDiv.textContent = message;
    chatbox.appendChild(msgDiv);
    chatbox.scrollTop = chatbox.scrollHeight;
}

