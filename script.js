const arcgisUrl = "https://services-eu1.arcgis.com/8uHkpVrXUjYCyrO4/ArcGIS/rest/services/TreeCrowns_BE_Bolstone_13032025_/FeatureServer/0/queryy";

const openaiApiKey = "YOUR_OPENAI_API_KEY";  // Replace with your OpenAI API key

function handleKeyPress(event) {
    if (event.key === "Enter") processQuery();
}

async function processQuery() {
    let userMessage = document.getElementById("userInput").value.trim();
    if (!userMessage) return;

    addMessage(userMessage, "user");

    // Process query with GPT
    let structuredQuery = await getAIQuery(userMessage);
    if (!structuredQuery) {
        addMessage("I didn't understand that. Try asking about feature stats or IDs.", "bot");
        return;
    }

    // Fetch data from ArcGIS API
    let queryUrl = `${arcgisUrl}?${structuredQuery}&f=json`;
    let response = await fetch(queryUrl);
    let data = await response.json();

    if (!data.features || data.features.length === 0) {
        addMessage("No matching features found.", "bot");
        return;
    }

    // Process and display results
    processResults(userMessage, data.features);
    document.getElementById("userInput").value = "";
}

// 🎯 Use ChatGPT to understand user queries and convert them to ArcGIS API filters
async function getAIQuery(userMessage) {
    let prompt = `
    Convert the following user request into an ArcGIS REST API query:
    "${userMessage}"
    Provide only the query string, not explanations.
    Example:
    - User: "Get feature IDs for California"
    - Output: "where=state='California'&outFields=OBJECTID&returnGeometry=false"
    `;

    let response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openaiApiKey}`
        },
        body: JSON.stringify({
            model: "gpt-4",
            messages: [{ role: "system", content: prompt }]
        })
    });

    let data = await response.json();
    return data.choices[0].message.content.trim();
}

// 🎯 Process and display data (text and charts)
function processResults(userMessage, features) {
    let featureIDs = features.map(f => f.attributes.OBJECTID);
    
    if (userMessage.includes("feature IDs")) {
        addMessage(`Feature IDs: ${featureIDs.join(", ")}`, "bot");
    } else if (userMessage.includes("count")) {
        addMessage(`Total features found: ${features.length}`, "bot");
    } else if (userMessage.includes("population")) {
        let totalPop = features.reduce((sum, f) => sum + (f.attributes.POP2000 || 0), 0);
        addMessage(`Total population: ${totalPop}`, "bot");
    } else if (userMessage.includes("chart")) {
        let populations = features.map(f => f.attributes.POP2000 || 0);
        let labels = features.map(f => f.attributes.NAME || "Unknown");
        generateChart(labels, populations);
    } else {
        addMessage("I retrieved the data but I'm not sure what stats to compute.", "bot");
    }
}

// 🎯 Display chat messages
