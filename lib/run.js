import { spawn } from 'child_process';

/**
 * Kill a process and its entire tree.
 * On Windows: taskkill /T /F kills the whole tree.
 * On Unix: kill the process group.
 */
function killTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { shell: true, stdio: 'ignore' });
    } else {
      process.kill(-pid, 'SIGTERM');
      setTimeout(() => {
        try { process.kill(-pid, 'SIGKILL'); } catch {}
      }, 5000);
    }
  } catch {}
}

/**
 * Strip ANSI escape codes from a string.
 */
function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]|\x1b\[[0-9]*[A-K]/g, '');
}

/**
 * Run a command asynchronously with proper timeout and process tree cleanup.
 *
 * Uses spawn() with piped output so we can stream in real time AND capture.
 * Timeout uses taskkill /T /F to kill the entire process tree.
 *
 * @param {string} cmd - Command to run (e.g. 'npm')
 * @param {string[]} args - Arguments (e.g. ['test'])
 * @param {object} opts
 * @param {string} opts.cwd - Working directory
 * @param {number} opts.timeout - Timeout in ms (default: 120000)
 * @param {'pipe'|'inherit'} opts.stdio - stdio mode (default: 'pipe')
 * @param {function} opts.onData - Callback for real-time output: onData(line)
 * @returns {Promise<{status: number|null, stdout: string, stderr: string}>}
 */
export function runCommand(cmd, args, opts = {}) {
  const timeout = opts.timeout || 120000;
  const cwd = opts.cwd || process.cwd();
  const useInherit = opts.stdio === 'inherit';
  const onData = opts.onData || null;
  const fullCmd = cmd + ' ' + args.join(' ');

  if (useInherit) {
    return new Promise((resolve) => {
      const child = spawn(cmd, args, { cwd, stdio: 'inherit', shell: true });
      const timer = setTimeout(() => {
        console.log(`    [run.js] TIMEOUT: ${fullCmd} — killing process tree (pid=${child.pid})`);
        killTree(child.pid);
        resolve({ status: 1, stdout: '', stderr: 'Timeout' });
      }, timeout);
      child.on('exit', (code) => {
        clearTimeout(timer);
        resolve({ status: code, stdout: '', stderr: '' });
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({ status: 1, stdout: '', stderr: err.message });
      });
    });
  }

  console.log(`    [run.js] exec: ${fullCmd} (cwd=${cwd}, timeout=${timeout}ms)`);
  return new Promise((resolve) => {
    let resolved = false;
    let stdout = '';
    let stderr = '';

    const child = spawn(cmd, args, { cwd, stdio: 'pipe', shell: true });
    console.log(`    [run.js] pid: ${child.pid}`);

    child.stdout.on('data', (d) => {
      const chunk = d.toString();
      stdout += chunk;
      if (onData) {
        const lines = stripAnsi(chunk).split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) onData(trimmed);
        }
      }
    });

    child.stderr.on('data', (d) => {
      const chunk = d.toString();
      stderr += chunk;
      if (onData) {
        const lines = stripAnsi(chunk).split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) onData(trimmed);
        }
      }
    });

    const timer = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      console.log(`    [run.js] TIMEOUT: ${fullCmd} — killing process tree (pid=${child.pid})`);
      killTree(child.pid);
      setTimeout(() => {
        resolve({ status: 1, stdout, stderr: stderr + `\nTimeout after ${timeout}ms` });
      }, 2000);
    }, timeout);

    child.on('exit', (code) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      console.log(`    [run.js] done: ${fullCmd} → exit=${code}`);
      resolve({ status: code, stdout, stderr });
    });

    child.on('error', (err) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      resolve({ status: 1, stdout, stderr: stderr + '\n' + err.message });
    });
  });
}
