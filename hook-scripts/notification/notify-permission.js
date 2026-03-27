#!/usr/bin/env node
/**
 * Notification Hook - Shows macOS alerts when Claude needs user input.
 * Logs to: ~/.claude/hooks-logs/YYYY-MM-DD.jsonl
 *
 * Setup in .claude/settings.json:
 * {
 *   "hooks": {
 *     "Notification": [{
 *       "matcher": "permission_prompt|idle_prompt|elicitation_dialog",
 *       "hooks": [{ "type": "command", "command": "node /path/to/notify-permission.js" }]
 *     }]
 *   }
 * }
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const LOG_DIR = path.join(process.env.HOME, '.claude', 'hooks-logs');

function log(data) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    const file = path.join(LOG_DIR, `${new Date().toISOString().slice(0, 10)}.jsonl`);
    fs.appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), hook: 'notify-permission', ...data }) + '\n');
  } catch {}
}

function getNotificationType(data) {
  if (data.notification_type) return data.notification_type;
  const msg = (data.message || '').toLowerCase();
  if (msg.includes('permission') || msg.includes('approve')) return 'permission_prompt';
  if (msg.includes('idle') || msg.includes('waiting')) return 'idle_prompt';
  if (msg.includes('elicitation') || msg.includes('mcp')) return 'elicitation_dialog';
  return 'notification';
}

function getProjectName(cwd) {
  return cwd ? path.basename(cwd) : 'unknown';
}

function getShortSessionId(sessionId) {
  return sessionId ? sessionId.slice(0, 6) : '????';
}

function getEmoji(type) {
  return { permission_prompt: '🔐', idle_prompt: '💤', elicitation_dialog: '🔧' }[type] || '🔔';
}

function getTitle(type, message) {
  const msg = (message || '').toLowerCase();
  if (type === 'elicitation_dialog' || msg.includes('select') || msg.includes('choose') || msg.includes('which')) {
    return 'Claude needs your choice';
  }
  if (type === 'permission_prompt') {
    if (msg.includes('bash') || msg.includes('command')) return 'Claude needs permission (Bash)';
    if (msg.includes('write') || msg.includes('create file')) return 'Claude needs permission (Write)';
    if (msg.includes('edit') || msg.includes('modify')) return 'Claude needs permission (Edit)';
    if (msg.includes('read')) return 'Claude needs permission (Read)';
    return 'Claude needs your attention';
  }
  if (type === 'idle_prompt') return 'Claude is waiting for you';
  return 'Claude notification';
}

function formatMessage(message) {
  if (!message) return 'No details provided';
  return message.length > 200 ? message.slice(0, 200) + '...' : message;
}

function showMacosNotification(message, title) {
  return new Promise((resolve) => {
    const script = `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`;
    execFile('osascript', ['-e', script], (error, _stdout, _stderr) => {
      if (error) {
        log({ level: 'WARN', msg: `osascript failed: ${error.message}` });
        resolve({ sent: false, error: error.message });
      } else {
        resolve({ sent: true });
      }
    });
  });
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  try {
    const data = JSON.parse(input);
    if (data.hook_event_name !== 'Notification') return console.log('{}');

    log({ level: 'INPUT', notification_type: data.notification_type, message: data.message, session_id: data.session_id });

    const type = getNotificationType(data);
    const title = `${getEmoji(type)} ${getTitle(type, data.message)}`;
    const body = `[${getProjectName(data.cwd)} · ${getShortSessionId(data.session_id)}] ${formatMessage(data.message)}`;

    const result = await showMacosNotification(body, title);

    log({ level: result.sent ? 'SENT' : 'NONE', type, session_id: data.session_id, ...(result.error && { error: result.error }) });
    console.log('{}');
  } catch (e) {
    log({ level: 'ERROR', error: e.message });
    console.log('{}');
  }
}

if (require.main === module) {
  main();
} else {
  module.exports = {
    getNotificationType,
    getProjectName,
    getShortSessionId,
    getEmoji,
    getTitle,
    formatMessage,
    showMacosNotification,
  };
}