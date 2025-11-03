import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const TEMPLATES_FILE = path.join(DATA_DIR, 'templates.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(TEMPLATES_FILE)) {
    const seed = {
      templates: [
        {
          id: 'email_follow_up',
          name: 'Professional Email Follow-Up',
          description: 'Follow-up email after no response',
          template: 'Subject: Follow-up on {{topic}}\n\nHi {{recipientName}},\n\nI hope you are well. I wanted to follow up regarding {{topic}} that we discussed on {{date}}. Please let me know if you have any updates or questions.\n\nBest regards,\n{{senderName}}'
        },
        {
          id: 'bug_report',
          name: 'Structured Bug Report',
          description: 'Template to report a software bug clearly',
          template: 'Title: {{title}}\n\nEnvironment: {{environment}}\nSteps to Reproduce:\n1) {{step1}}\n2) {{step2}}\nExpected: {{expected}}\nActual: {{actual}}\nAdditional Notes: {{notes}}'
        }
      ]
    };
    fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(seed, null, 2), 'utf-8');
  }
  if (!fs.existsSync(USERS_FILE)) {
    const seedUsers = { users: [] };
    fs.writeFileSync(USERS_FILE, JSON.stringify(seedUsers, null, 2), 'utf-8');
  }
}

function readTemplates() {
  ensureDataFile();
  const raw = fs.readFileSync(TEMPLATES_FILE, 'utf-8');
  return JSON.parse(raw).templates || [];
}

function readUsers() {
  ensureDataFile();
  const raw = fs.readFileSync(USERS_FILE, 'utf-8');
  return JSON.parse(raw).users || [];
}

function writeUsers(users) {
  ensureDataFile();
  fs.writeFileSync(USERS_FILE, JSON.stringify({ users }, null, 2), 'utf-8');
}

function extractPlaceholders(templateString) {
  const regex = /\{\{\s*([a-zA-Z0-9_\.]+)\s*\}\}/g;
  const names = new Set();
  let match;
  while ((match = regex.exec(templateString)) !== null) {
    names.add(match[1]);
  }
  return Array.from(names);
}

function renderTemplate(templateString, values) {
  return templateString.replace(/\{\{\s*([a-zA-Z0-9_\.]+)\s*\}\}/g, (_, key) => {
    const value = values[key];
    return value !== undefined && value !== null ? String(value) : `{{${key}}}`;
  });
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function getUserById(userId) {
  const users = readUsers();
  return users.find(u => u.id === userId) || null;
}

function saveUser(updatedUser) {
  const users = readUsers();
  const idx = users.findIndex(u => u.id === updatedUser.id);
  if (idx === -1) return false;
  users[idx] = updatedUser;
  writeUsers(users);
  return true;
}

// Authentication routes code start

app.post('/api/auth/register', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
  const users = readUsers();
  if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: 'Email already registered' });
  }
  const id = uuidv4();
  const passwordHash = bcrypt.hashSync(password, 10);
  // Seed two example templates per new user
  const userTemplates = readTemplates();
  const newUser = { id, email, passwordHash, templates: userTemplates };
  users.push(newUser);
  writeUsers(users);
  const token = jwt.sign({ sub: id, email }, JWT_SECRET, { expiresIn: '7d' });
  res.status(201).json({ token, user: { id, email } });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
  const users = readUsers();
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = bcrypt.compareSync(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, email: user.email } });
});

// code end

app.get('/api/templates', authMiddleware, (req, res) => {
  const user = getUserById(req.user.id);
  res.json({ templates: user?.templates || [] });
});

app.get('/api/templates/:id', authMiddleware, (req, res) => {
  const user = getUserById(req.user.id);
  const tpl = (user?.templates || []).find(t => t.id === req.params.id);
  if (!tpl) return res.status(404).json({ error: 'Template not found' });
  res.json({ template: tpl });
});

app.post('/api/templates', authMiddleware, (req, res) => {
  const { id, name, description, template } = req.body || {};
  if (!id || !name || !template) {
    return res.status(400).json({ error: 'id, name, and template are required' });
  }
  const user = getUserById(req.user.id);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (user.templates.length >= 4) {
    return res.status(403).json({ error: 'Template limit reached (2 per user)' });
  }
  if (user.templates.some(t => t.id === id)) {
    return res.status(409).json({ error: 'Template with this id already exists' });
  }
  const newTemplate = { id, name, description: description || '', template };
  user.templates.push(newTemplate);
  saveUser(user);
  res.status(201).json({ template: newTemplate });
});

app.put('/api/templates/:id', authMiddleware, (req, res) => {
  const { name, description, template } = req.body || {};
  const user = getUserById(req.user.id);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const idx = user.templates.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Template not found' });
  const updated = { ...user.templates[idx] };
  if (name !== undefined) updated.name = name;
  if (description !== undefined) updated.description = description;
  if (template !== undefined) updated.template = template;
  user.templates[idx] = updated;
  saveUser(user);
  res.json({ template: updated });
});

// Prompt Generate via Free AI code Start
app.post('/api/generate', authMiddleware, async (req, res) => {
  const { template, values, improve } = req.body || {};
  if (!template || typeof template !== 'string') {
    return res.status(400).json({ error: 'template is required' });
  }
  const resolved = renderTemplate(template, values || {});
  const variables = extractPlaceholders(template);
  if (!improve) {
    return res.json({ resolved, variables, source: 'local' });
  }
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Gemini API key not configured' });
  }
  try {
    const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    const prompt = `You are a helpful assistant that improves prompt wording without changing intent. Given the resolved prompt below, rewrite it to be clear, concise, and effective for LLMs. Return only the improved prompt.\n\nResolved Prompt:\n\n${resolved}`;

    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const improved = response?.text;

    if (!improved) {
      throw new Error('Gemini returned an empty response.');
    }

    return res.json({ resolved: improved, variables, source: 'gemini' });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown Gemini error';
    console.error('Gemini generate error:', e);
    return res.json({ resolved, variables, source: 'local', note: `Gemini enhancement failed: ${message}` });
  }
});

// code End

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  ensureDataFile();
  console.log(`Prompt Template Designer server running on http://localhost:${PORT}`);
});


