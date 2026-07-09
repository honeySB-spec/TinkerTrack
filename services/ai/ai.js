import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { getDb } from '../shared/shared.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Simple .env parser to avoid external dependencies
function loadEnv() {
  const envPath = path.resolve(__dirname, '../../.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (match) {
        const key = match[1];
        let val = match[2].trim();
        // Remove quotes if present
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}
loadEnv();

const app = express();
app.use(express.json());
const PORT = 5070;
const pool = getDb();

// Helper to format Date for DB comparison and response
function formatDateTime(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

app.post('/api/ai/chat', async (req, res) => {
  const { query } = req.body;
  const userId = req.header('X-User-Id');
  const userRole = req.header('X-User-Role') || 'Undergraduate';
  const userName = req.header('X-User-Name') || 'User';

  if (!query) {
    return res.status(400).json({ error: "Query is required" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.json({
      text: "⚠️ **Gemini API Key Missing**: Please configure your `GEMINI_API_KEY` in the `.env` file in the project root and restart the server to use the AI assistant.",
      action: null
    });
  }

  try {
    // 1. Fetch current catalog and reservation data from DB
    const resourcesRes = await pool.query(
      `SELECT r.id, r.category_id, r.name, r.status, r.requires_approval, r.restricted_roles, r.description, c.name as category_name 
       FROM resources r 
       JOIN categories c ON r.category_id = c.id 
       ORDER BY r.id ASC`
    );
    const reservationsRes = await pool.query(
      `SELECT r.id, r.user_id, r.resource_id, r.start_time, r.end_time, r.status, res.name as resource_name 
       FROM reservations r 
       JOIN resources res ON r.resource_id = res.id 
       WHERE r.status IN ('Confirmed', 'PendingApproval', 'CheckedIn') 
       ORDER BY r.id ASC`
    );

    // Format resources to match frontend expectations (requires_approval as 0/1, restricted_roles stringified JSON)
    const resources = resourcesRes.rows.map(row => ({
      id: row.id,
      category_id: row.category_id,
      name: row.name,
      status: row.status,
      requires_approval: row.requires_approval ? 1 : 0,
      restricted_roles: JSON.stringify(row.restricted_roles || []),
      description: row.description,
      category_name: row.category_name
    }));

    const reservations = reservationsRes.rows.map(row => ({
      id: row.id,
      user_id: row.user_id,
      resource_id: row.resource_id,
      start_time: formatDateTime(new Date(row.start_time)),
      end_time: formatDateTime(new Date(row.end_time)),
      status: row.status,
      resource_name: row.resource_name
    }));

    // 2. Prepare Context for Gemini
    const now = new Date();
    const systemTimeStr = formatDateTime(now) + ` (Day of week: ${now.toLocaleDateString('en-US', { weekday: 'long' })})`;

    const systemInstruction = `You are the TinkerTrack AI Scheduling Assistant. Your job is to parse the user's natural language request, check resource availability in the catalog and current reservation schedules, and return a structured JSON response.

Current System Time: ${systemTimeStr}
Current User Name: ${userName}
Current User Role: ${userRole}

List of resources in the catalog:
${JSON.stringify(resources, null, 2)}

List of active bookings/reservations:
${JSON.stringify(reservations, null, 2)}

Use these rules to process the request:
1. Parse the requested resource name, date, time, and duration from the user query.
2. Translate relative dates (like "today", "tomorrow", "this Friday", "day after tomorrow") into absolute timestamps (format: "YYYY-MM-DD HH:MM:00") based on the Current System Time.
3. Check if the user is asking to check availability, book a slot, get suggestions/recommendations, or asking general questions.
4. If the query refers to a specific resource (either matches name case-insensitively or matches standard shorthands like room a/b, microscope, canon, printer, etc.):
   - Identify the matching resource.
   - Check if the user's role is restricted. The resource has a field \`restricted_roles\` (JSON string of array of roles). If userRole is in this array, the access is restricted/denied.
   - If restricted, set action type to null and explain that their role is denied in the text.
   - Check if the requested timeslot overlaps with any existing bookings for this resource (where status is 'Confirmed', 'PendingApproval', or 'CheckedIn').
     - An overlap occurs if: booking.start_time < requested.end_time AND booking.end_time > requested.start_time.
   - If there is a conflict:
     - Find alternative resources in the same category that are 'Available' and have NO conflicts during the requested timeslot, and are NOT restricted to the user's role.
     - Set action type to "conflict".
   - If there is no conflict and no restriction:
     - Set action type to "available".
5. If the user is asking for suggestions or recommendations (e.g. "suggest a room", "recommend media gear", "what lab equipment is open?"):
   - Recommend a resource that has status 'Available' and fits the requested category.
   - Set action type to "recommendation".
6. If the query is a general conversation or query that does not translate to booking/checking availability/recommendation, set action to null.

You MUST return a JSON object with the following schema:
{
  "text": "Friendly markdown response explaining the result. Be concise and precise. Highlight date, time, resource name, and conflicts if any.",
  "action": {
    "type": "available" | "conflict" | "recommendation" | null,
    "resource": {
      "id": number,
      "category_id": number,
      "name": "string",
      "status": "string",
      "requires_approval": number,
      "restricted_roles": "string",
      "description": "string"
    } | null,
    "start": "YYYY-MM-DD HH:MM:00" | null,
    "end": "YYYY-MM-DD HH:MM:00" | null,
    "alternatives": [
      {
        "id": number,
        "category_id": number,
        "name": "string",
        "status": "string",
        "requires_approval": number,
        "restricted_roles": "string",
        "description": "string"
      }
    ] | null
  }
}

The 'resource' object in 'action' and objects in 'alternatives' must be taken directly from the provided resources catalog list and maintain their exact field structure.`;

    // 3. Invoke Gemini API via fetch
    // Try gemini-2.5-flash first, fallback to gemini-1.5-flash if needed
    let model = 'gemini-2.5-flash';
    let response;
    let responseData;

    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `User query: "${query}"` }] }],
            systemInstruction: { parts: [{ text: systemInstruction }] },
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.1
            }
          })
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      responseData = await response.json();
    } catch (modelErr) {
      console.warn(`[AI Service] Gemini 2.5 Flash failed, trying 1.5 Flash... Error: ${modelErr.message}`);
      model = 'gemini-1.5-flash';
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `User query: "${query}"` }] }],
            systemInstruction: { parts: [{ text: systemInstruction }] },
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.1
            }
          })
        }
      );
      if (!response.ok) {
        throw new Error(`Fallback model ${model} also failed with HTTP error ${response.status}`);
      }
      responseData = await response.json();
    }

    const resultText = responseData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!resultText) {
      throw new Error("No response content from Gemini API");
    }

    const parsedResult = JSON.parse(resultText.trim());
    res.json(parsedResult);

  } catch (error) {
    console.error("[AI Service] Error processing request:", error);
    res.status(500).json({
      text: "Sorry, I had trouble processing your query. Please make sure the Gemini API key is valid.",
      action: null,
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`[AI Service] Running on port ${PORT}`);
});
