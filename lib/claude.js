import fs from 'fs/promises';
import { createWriteStream, createReadStream } from 'fs';
import path from 'path';
import { spawn as cpSpawn } from 'child_process';

/**
 * Parse a stream-json event into a human-readable log line.
 * Returns { logLine, activity } where activity is a short status for the spinner.
 */
export function parseStreamEvent(event) {
  try {
    const evt = JSON.parse(event);
    const type = evt.type;

    if (type === 'assistant' && evt.message) {
      // Text content from Claude
      const textBlocks = (evt.message.content || []).filter((b) => b.type === 'text');
      if (textBlocks.length > 0) {
        const text = textBlocks.map((b) => b.text).join('');
        return { logLine: `[assistant] ${text}`, activity: null };
      }
      // Tool use block
      const toolBlocks = (evt.message.content || []).filter((b) => b.type === 'tool_use');
      if (toolBlocks.length > 0) {
        const tool = toolBlocks[0];
        const summary = formatToolUse(tool);
        return { logLine: `[tool_use] ${tool.name}: ${JSON.stringify(tool.input)}`, activity: summary };
      }
    }

    if (type === 'tool_result' || type === 'result') {
      const content = typeof evt.content === 'string' ? evt.content : JSON.stringify(evt.content || '');
      return { logLine: `[${type}] ${content}`, activity: null };
    }

    // System or other event types
    if (type) {
      return { logLine: `[${type}] ${JSON.stringify(evt)}`, activity: null };
    }
  } catch {
    // Not valid JSON — raw output
  }
  return { logLine: event, activity: null };
}

/**
 * Format a tool_use block into a short human-readable activity string.
 */
export function formatToolUse(tool) {
  const name = tool.name;
  const input = tool.input || {};

  if (name === 'Write' || name === 'Edit') {
    return `${name}: ${input.file_path || input.path || ''}`.replace(/.*[/\\]/, `${name}: `);
  }
  if (name === 'Read') {
    return `Reading: ${(input.file_path || '').replace(/.*[/\\]/, '')}`;
  }
  if (name === 'Bash') {
    const cmd = (input.command || '').slice(0, 80);
    return `Running: ${cmd}`;
  }
  if (name === 'Glob') {
    return `Searching: ${input.pattern || ''}`;
  }
  if (name === 'Grep') {
    return `Grep: ${input.pattern || ''}`;
  }
  return `${name}`;
}

/**
 * Run Claude with stream-json output, real-time logging, spinner activity, and timeout.
 *
 * @param {string} prompt - The prompt to send to Claude
 * @param {object} opts
 * @param {string} opts.cwd - Working directory
 * @param {number} opts.maxTurns - Max turns (default 200)
 * @param {number} opts.timeout - Timeout in minutes (default 30)
 * @param {string} opts.logFile - Path to log file (logs prompt + all output)
 * @param {object} opts.spinner - Spinner object with .activity(text) method
 * @param {boolean} opts.verbose - Print parsed events to console
 * @returns {Promise<{status: number, stdout: string, stderr: string, output: string}>}
 */
export async function runClaude(prompt, opts = {}) {
  const maxTurns = opts.maxTurns || 200;
  const cwd = opts.cwd || process.cwd();
  const timeoutMs = (opts.timeout || 30) * 60 * 1000;

  // Write prompt to a temp file to avoid stdin/argument length issues on Windows
  const tmpFile = path.join(cwd, '.forge-prompt-tmp.md');
  await fs.writeFile(tmpFile, prompt, 'utf-8');

  return new Promise((resolve) => {
    let resolved = false;
    const args = [
      '--print', '--verbose',
      '--output-format', 'stream-json',
      '--allowedTools', 'Edit,Write,Bash,Read,Glob,Grep',
      '--max-turns', String(maxTurns),
    ];
    const child = cpSpawn('claude', args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    });

    let stdout = '';
    let stderr = '';
    let lineBuffer = '';

    // Stream output to log file in real time
    let logStream = null;
    if (opts.logFile) {
      logStream = createWriteStream(opts.logFile, { flags: 'a' });
      // Log the prompt we're sending
      logStream.write('=== PROMPT SENT TO CLAUDE ===\n');
      logStream.write(prompt);
      logStream.write('\n=== END PROMPT ===\n\n=== CLAUDE OUTPUT ===\n');
    }

    const spinner = opts.spinner;
    const verbose = opts.verbose || false;

    // Kill the child process if it exceeds the timeout
    const timer = setTimeout(() => {
      if (!resolved) {
        const msg = `\n--- TIMEOUT: step exceeded ${opts.timeout || 30} minute limit, killing process ---\n`;
        if (logStream) logStream.write(msg);
        stderr += msg;
        child.kill('SIGTERM');
        setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 10000);
      }
    }, timeoutMs);

    child.stdout.on('data', (d) => {
      const chunk = d.toString();
      stdout += chunk;
      lineBuffer += chunk;

      // Process complete lines (stream-json emits one JSON object per line)
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        const { logLine, activity } = parseStreamEvent(line);

        // Always write to log file
        if (logStream) logStream.write(logLine + '\n');

        // Update spinner with latest tool activity
        if (activity && spinner) {
          spinner.activity(activity);
        }

        // Print to console in verbose mode
        if (verbose && logLine) {
          process.stdout.write(`\n    ${logLine}`);
        }
      }
    });

    child.stderr.on('data', (d) => {
      const chunk = d.toString();
      stderr += chunk;
      if (logStream) logStream.write(`[stderr] ${chunk}`);
      // Always show stderr — these are errors
      if (spinner) {
        spinner.activity(`[error] ${chunk.trim().split('\n')[0]}`);
      }
    });

    child.on('close', (code) => {
      // Flush remaining buffer
      if (lineBuffer.trim()) {
        const { logLine } = parseStreamEvent(lineBuffer);
        if (logStream) logStream.write(logLine + '\n');
      }
      resolved = true;
      clearTimeout(timer);
      if (logStream) {
        logStream.write(`\n=== CLAUDE EXIT CODE: ${code} ===\n`);
        logStream.end();
      }
      fs.unlink(tmpFile).catch(() => {});
      resolve({ status: code, stdout, stderr, output: stdout + '\n' + stderr });
    });
    child.on('error', (err) => {
      resolved = true;
      clearTimeout(timer);
      if (logStream) {
        logStream.write(`\n=== CLAUDE ERROR: ${err.message} ===\n`);
        logStream.end();
      }
      fs.unlink(tmpFile).catch(() => {});
      resolve({ status: 1, stdout, stderr, output: `ERROR: ${err.message}` });
    });

    // Pipe the temp file content via stdin
    const rs = createReadStream(tmpFile);
    rs.pipe(child.stdin);
  });
}
