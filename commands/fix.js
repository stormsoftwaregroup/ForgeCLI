import fs from 'fs/promises';
import path from 'path';
import { createSpinner } from '../lib/spinner.js';
import { runClaude } from '../lib/claude.js';
import { runCommand } from '../lib/run.js';

const FIX_PREAMBLE = `SYSTEM INSTRUCTIONS — READ BEFORE DOING ANYTHING:

You are fixing failing tests. Follow these rules strictly:

1. Read the test output below carefully. Identify every failing test.
2. For each failure, determine whether the bug is in the application code or the test itself.
3. Fix the root cause — do NOT just make the test pass by weakening assertions.
4. If a test expects behavior that the application should provide, fix the application code.
5. If a test has a wrong assertion or outdated expectation, fix the test.
6. After fixing, run the tests again to verify they pass.
7. If new failures appear after your fixes, fix those too.
8. Do not ask questions. Do not pause for confirmation.
9. Do not skip any failing test.

TEST OUTPUT:
---
`;

const DEFAULT_MAX_LOOPS = 100;

/**
 * Run tests and return { allPass, testOutput }.
 */
async function runTests(projectDir, options) {
  let testOutput = '';
  let allPass = true;

  const streamLine = (line) => {
    console.log(`      ${line}`);
  };

  if (!options.e2eOnly) {
    console.log('    Running Jest...');
    const jestResult = await runCommand('npm', ['test', '--', '--forceExit'], {
      cwd: projectDir,
      timeout: 120000,
      onData: streamLine,
    });
    const jestOut = (jestResult.stdout || '') + '\n' + (jestResult.stderr || '');
    if (jestResult.status !== 0) {
      testOutput += 'JEST TEST FAILURES:\n' + jestOut + '\n\n';
      allPass = false;
    }
  }

  if (!options.unitOnly) {
    const hasPlaywright = await fs.access(path.join(projectDir, 'playwright.config.js')).then(() => true).catch(() => false);
    if (hasPlaywright) {
      console.log('    Running Playwright...');
      const pwResult = await runCommand('npx', ['playwright', 'test'], {
        cwd: projectDir,
        timeout: 300000,
        onData: streamLine,
      });
      const pwOut = (pwResult.stdout || '') + '\n' + (pwResult.stderr || '');
      if (pwResult.status !== 0) {
        testOutput += 'PLAYWRIGHT E2E FAILURES:\n' + pwOut + '\n\n';
        allPass = false;
      }
    }
  }

  return { allPass, testOutput };
}

/**
 * Run one fix loop: test → fix → verify.
 * Returns true if all tests pass after the fix.
 */
async function runFixLoop(projectDir, options, loopNum, logDir) {
  // Run tests
  let sp = createSpinner(`Loop ${loopNum}: Running tests`);
  const { allPass, testOutput } = await runTests(projectDir, options);

  if (allPass) {
    sp.succeed(`Loop ${loopNum}: All tests pass`);
    return true;
  }

  sp.fail(`Loop ${loopNum}: Tests failed — sending to Claude for fix`);

  // Log what we're sending
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const logFile = path.join(logDir, `${timestamp}-fix-loop${loopNum}.log`);

  // Feed failures to Claude with streaming + logging
  sp = createSpinner(`Loop ${loopNum}: Fixing failures`);
  const prompt = FIX_PREAMBLE + testOutput;

  const result = await runClaude(prompt, {
    cwd: projectDir,
    maxTurns: parseInt(options.maxTurns, 10) || 200,
    timeout: parseInt(options.timeout, 10) || 30,
    logFile,
    spinner: sp,
    verbose: options.verbose || false,
  });

  if (result.status !== 0) {
    sp.fail(`Loop ${loopNum}: Fix attempt had errors (log: ${path.relative(projectDir, logFile)})`);
  } else {
    sp.succeed(`Loop ${loopNum}: Fix attempt completed (log: ${path.relative(projectDir, logFile)})`);
  }

  // Verify
  sp = createSpinner(`Loop ${loopNum}: Verifying fixes`);
  const verify = await runTests(projectDir, options);

  if (verify.allPass) {
    sp.succeed(`Loop ${loopNum}: All tests pass after fix`);
    return true;
  }

  sp.fail(`Loop ${loopNum}: Some tests still failing`);
  return false;
}

async function handleFix(options) {
  const projectDir = process.cwd();
  const maxLoops = options.single ? 1 : (parseInt(options.maxLoops, 10) || DEFAULT_MAX_LOOPS);

  const logDir = path.join(projectDir, 'forge', 'logs');
  await fs.mkdir(logDir, { recursive: true });

  console.log('');
  console.log(`  forge fix — ${options.single ? 'single pass' : `looping until all pass (max ${maxLoops})`}`);
  console.log(`  Logs: ${path.relative(projectDir, logDir)}`);
  console.log('');

  for (let loop = 1; loop <= maxLoops; loop++) {
    const passed = await runFixLoop(projectDir, options, loop, logDir);

    if (passed) {
      console.log('');
      console.log('  All tests pass. Done.');
      console.log('');
      return;
    }

    if (loop < maxLoops) {
      console.log(`    Retrying... (${loop}/${maxLoops})`);
      console.log('');
    }
  }

  console.log('');
  console.log(`  Tests still failing after ${maxLoops} loops.`);
  console.log('  Check logs in forge/logs/ or fix manually.');
  console.log('');
}

export function registerFixCommand(program) {
  program
    .command('fix')
    .description('Run tests, auto-fix failures via Claude, loop until all pass')
    .option('--single', 'Run only one fix loop instead of looping')
    .option('--unit-only', 'Only fix Jest unit test failures')
    .option('--e2e-only', 'Only fix Playwright E2E failures')
    .option('--max-loops <N>', `Max fix loops (default: ${DEFAULT_MAX_LOOPS})`, String(DEFAULT_MAX_LOOPS))
    .option('--max-turns <N>', 'Max Claude turns per loop (default: 200)', '200')
    .option('--timeout <minutes>', 'Max minutes per fix attempt (default: 30)', '30')
    .option('--verbose', 'Show real-time Claude activity in console')
    .action(handleFix);
}
