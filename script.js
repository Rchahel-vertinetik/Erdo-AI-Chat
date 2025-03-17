const arcgisUrl = "https://services-eu1.arcgis.com/8uHkpVrXUjYCyrO4/ArcGIS/rest/services/TreeCrowns_BE_Bolstone_13032025_/FeatureServer/0/queryy";

function handleKeyPress(event) {
    if (event.key === "Enter") processQuery();
}

async function processQuery() {
    let userMessage = document.getElementById("userInput").value;
    if (!userMessage.trim()) return;

    // Display user message
    addMessage(userMessage, "user");

    // Convert text input to ArcGIS API query
    let query = parseNaturalLanguage(userMessage);
    
    if (!query) {
        addMessage("I didn’t understand that. Try something like: 'Get all feature IDs where city = Edinburgh.'", "bot");
        return;
    }

    let url = `${arcgisUrl}?${query}&f=json`;

    try {
        let response = await fetch(url);
        let data = await response.json();
        
        if (data.features.length > 0) {
            let featureIDs = data.features.map(feature => feature.attributes.OBJECTID);
            addMessage(`Found ${featureIDs.length} features. IDs: ${featureIDs.join(", ")}`, "bot");
        } else {
            addMessage("No matching features found.", "bot");
        }
    } catch (error) {
        addMessage("Error fetching data.", "bot");
        console.error(error);
    }

    document.getElementById("userInput").value = "";
}

function parseNaturalLanguage(userMessage) {
    userMessage = userMessage.toLowerCase();

    // Example patterns
    if (userMessage.includes("how many")) {
        return "where=1=1&returnCountOnly=true";
    }
    if (userMessage.includes("feature ids")) {
        let match = userMessage.match(/where (.+)/);
        let whereClause = match ? encodeURIComponent(match[1]) : "1=1";
        return `where=${whereClause}&outFields=OBJECTID&returnGeometry=false`;
    }
    if (userMessage.includes("sum population")) {
        return "where=1=1&outStatistics=[{statisticType:'sum',onStatisticField:'POP2000',outStatisticFieldName:'total_population'}]";
    }

    return null; // If the query is not understood
}

function addMessage(message, sender) {
    let chatbox = document.getElementById("messages");
    let msgDiv = document.createElement("div");
    msgDiv.className = sender;
    msgDiv.textContent = message;
    chatbox.appendChild(msgDiv);
    chatbox.scrollTop = chatbox.scrollHeight;
}
