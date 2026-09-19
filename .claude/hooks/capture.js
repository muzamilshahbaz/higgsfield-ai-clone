#!/usr/bin/env node
/**
 * Automatic interaction capture for Claude Code.
 *
 * Wired to SessionStart / UserPromptSubmit / Stop / SessionEnd in
 * .claude/settings.json. The harness runs it; the model never invokes it.
 *
 * Strategy: full deterministic rebuild from the session transcripts on every
 * run. Rebuilding (instead of appending) makes the hook idempotent and
 * self-healing -- a missed or interrupted event is repaired by the next run,
 * and sessions that predate the hook install are backfilled.
 *
 * Captures ONLY: user prompt text, final assistant text, UTC timestamp, model.
 * Excluded by construction: thinking blocks, tool_use, tool_result, sidechain
 * (subagent) traffic, attachments, system reminders, meta records.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const PROJECT_DIR = path.resolve(__dirname, '..', '..');
const LOG_DIR = path.join(PROJECT_DIR, '.agent-logs');
const PROJECT_NAME = path.basename(PROJECT_DIR);
const TOOL = 'claude-code';

/* ---------------------------------------------------------------- helpers */

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (_) {
    return '';
  }
}

function author() {
  const keys = [['config', '--get', 'github.user'], ['config', '--get', 'user.name']];
  for (const args of keys) {
    try {
      const v = execFileSync('git', args, {
        cwd: PROJECT_DIR,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (v) return v;
    } catch (_) { /* git absent or key unset */ }
  }
  return os.userInfo().username || 'unknown';
}

function readJsonl(file) {
  const out = [];
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (_) {
    return out;
  }
  for (const line of raw.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try { out.push(JSON.parse(s)); } catch (_) { /* partial trailing write */ }
  }
  return out;
}

/* ------------------------------------------------------ record extraction */

// A genuine typed prompt: external user turn, not a tool result, not meta,
// not subagent traffic.
function promptText(rec) {
  if (!rec || rec.type !== 'user' || rec.isSidechain || rec.isMeta) return null;
  if (rec.userType && rec.userType !== 'external') return null;
  const content = rec.message && rec.message.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;
  if (content.some((b) => b && b.type === 'tool_result')) return null;
  const text = content.filter((b) => b && b.type === 'text').map((b) => b.text).join('');
  return text || null;
}

// Final visible answer only: text blocks, never thinking/tool_use.
function assistantText(rec) {
  if (!rec || rec.type !== 'assistant' || rec.isSidechain) return null;
  const content = rec.message && rec.message.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;
  const text = content.filter((b) => b && b.type === 'text').map((b) => b.text).join('');
  return text || null;
}

// Walk a transcript into ordered { prompt, response } exchanges.
function exchanges(records) {
  const pairs = [];
  let current = null;
  for (const rec of records) {
    const p = promptText(rec);
    if (p !== null) {
      current = {
        prompt: p,
        promptTime: rec.timestamp || null,
        model: null,
        responseParts: [],
        responseTime: null,
      };
      pairs.push(current);
      continue;
    }
    if (!current) continue;
    const a = assistantText(rec);
    if (a !== null) {
      current.responseParts.push(a);
      current.responseTime = rec.timestamp || current.responseTime;
      if (rec.message && rec.message.model) current.model = rec.message.model;
    }
  }
  return pairs;
}

/* --------------------------------------------------------- log rendering */

function lastModel(pairs) {
  const withModel = pairs.filter((p) => p.model);
  return withModel.length ? withModel[withModel.length - 1].model : null;
}

function render(sessionId, pairs, who) {
  const model = lastModel(pairs) || 'unknown';
  const times = pairs.map((p) => p.promptTime).filter(Boolean);
  const first = times.length ? times[0] : '';
  const last = times.length ? times[times.length - 1] : '';

  const head = [
    '---',
    'session_id: ' + sessionId,
    'date: ' + (first ? first.slice(0, 10) : ''),
    'author: ' + who,
    'model: ' + model,
    'tool: ' + TOOL,
    'project: ' + PROJECT_NAME,
    'total_exchanges: ' + pairs.length,
    'first_prompt_time: ' + first,
    'last_prompt_time: ' + last,
    '---',
    '',
    '# Session Log',
    '',
    'Session: `' + sessionId + '` | Project: `' + PROJECT_NAME + '`',
    '',
    '---',
    '',
  ];

  const body = [];
  pairs.forEach((p, i) => {
    const num = i + 1;
    const m = p.model || model;
    body.push('[LOG_ENTRY type=PROMPT num=' + num + ' session=' + sessionId + ']', '');
    body.push('timestamp: ' + (p.promptTime || ''), 'model: ' + m, '');
    body.push(p.prompt.trim(), '', '');

    const response = p.responseParts.join('\n\n').trim();
    if (response) {
      body.push('[LOG_ENTRY type=RESPONSE num=' + num + ' session=' + sessionId + ']', '');
      body.push('timestamp: ' + (p.responseTime || ''), 'model: ' + m, '');
      body.push(response, '', '');
    }
  });

  return head.concat(body).join('\n').trimEnd() + '\n';
}

function writeIfChanged(file, content) {
  try {
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return;
  } catch (_) { /* fall through to write */ }
  fs.writeFileSync(file, content, 'utf8');
}

/* -------------------------------------------------------------- main flow */

function main() {
  let input = {};
  try { input = JSON.parse(readStdin() || '{}'); } catch (_) { input = {}; }

  const transcriptPath = input.transcript_path || '';
  const sessionId = input.session_id || '';
  const pendingPrompt = input.hook_event_name === 'UserPromptSubmit' ? input.prompt : null;

  // Locate the transcript store from the path the harness handed us; fall back
  // to Claude Code's own cwd-slug convention if it is absent.
  let store = transcriptPath ? path.dirname(transcriptPath) : '';
  if (!store || !fs.existsSync(store)) {
    const slug = PROJECT_DIR.replace(/[^a-zA-Z0-9]/g, '-');
    store = path.join(os.homedir(), '.claude', 'projects', slug);
  }
  if (!fs.existsSync(store)) return;

  fs.mkdirSync(LOG_DIR, { recursive: true });
  const who = author();

  const files = fs.readdirSync(store)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => path.join(store, f));

  for (const file of files) {
    const id = path.basename(file, '.jsonl');
    const pairs = exchanges(readJsonl(file));

    // UserPromptSubmit can fire before the prompt lands in the transcript.
    // Merge it in only if it is not already the trailing prompt.
    if (pendingPrompt && id === sessionId) {
      const tail = pairs.length ? pairs[pairs.length - 1] : null;
      if (!tail || tail.prompt.trim() !== String(pendingPrompt).trim()) {
        pairs.push({
          prompt: String(pendingPrompt),
          promptTime: new Date().toISOString(),
          model: lastModel(pairs),
          responseParts: [],
          responseTime: null,
        });
      }
    }

    if (!pairs.length) continue;
    const date = (pairs[0].promptTime || new Date().toISOString()).slice(0, 10);
    writeIfChanged(path.join(LOG_DIR, date + '-' + id + '.md'), render(id, pairs, who));
  }
}

try { main(); } catch (_) { /* never block or disturb the session */ }
process.exit(0);
