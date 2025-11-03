Prompt Template Designer

A React + Node (Express) app to create reusable AI prompt templates with placeholders,User can fill variables, and generate final prompts. Templates are stored in a simple JSON file on the server.

Features
- Create, view, and edit prompt templates with {{placeholders}}
- Provide values to generate the resolved prompt
- Copy resolved prompt to clipboard
- Two example templates are seeded on first run
- File-based storage for optional reuse (save/load)

Tech Stack
- Backend: Node.js, Express
- Frontend: React 18 (CDN), Babel (CDN), served as static files
- AI
Getting Started

Prerequisites
- Node.js 18+

Environment
Create a `.env` file in `server/` (or set environment variables):
```
JWT_SECRET=replace_with_a_long_random_string
GEMINI_API_KEY=your_gemini_api_key
```

Install and Run
```
cd server
npm install
npm start
```
Then open http://localhost:3000 in your browser.

Data is stored at server/data/templates.json (created automatically on first run).

API Endpoints
- GET /api/templates – list all templates
- GET /api/templates/:id – get template by id
- POST /api/templates – create a template { id, name, description?, template }
- PUT /api/templates/:id – update name/description/template
- POST /api/generate – { template, values, improve? } → { resolved, variables, source }
- POST /api/auth/register – { email, password } → { token, user }
- POST /api/auth/login – { email, password } → { token, user }

Notes
- Placeholders use double curly braces, e.g. {{recipientName}}.
- Unknown variables remain as {{variable}} in the output, so you can see what’s missing.
- By default, generation uses Gemini 2.5 Flash (set improve=true). If Gemini fails or not configured, it falls back to local substitution when improve is false.

Acceptance Criteria Mapping
- Users can create at least 2 prompt templates: seeded and creatable via UI
- Logged-in users can create up to 3 templates (limit enforced server-side)
- Users can provide input values to generate the final prompt: UI inputs + Generate
- Output shows the resolved prompt clearly: displayed in “Resolved Prompt” with copy
- Optional: Save and load templates for reuse: stored in JSON, listed in UI


Test Credentials for testing :-
-- Email : 'Test@gmail.com'
-- Password : 'Test@12345'

-- Email : 'Test1@gmail.com'
-- Password : 'Test@1234'
