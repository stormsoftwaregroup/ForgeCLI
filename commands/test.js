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

/**
 * Run Jest and return { status, stdout, stderr }.
 */
const streamLine = (line) => {
  console.log(`      ${line}`);
};

async function runJest(projectDir, opts = {}) {
  const args = ['test', '--', '--forceExit'];
  if (opts.coverage) args.push('--coverage');
  if (opts.watch) args.push('--watch');

  return runCommand('npm', args, {
    cwd: projectDir,
    stdio: opts.inherit ? 'inherit' : 'pipe',
    timeout: 120000,
    onData: opts.inherit ? null : streamLine,
  });
}

/**
 * Run Playwright and return { status, stdout, stderr }.
 */
async function runPlaywright(projectDir, opts = {}) {
  return runCommand('npx', ['playwright', 'test', ...(opts.ui ? ['--ui'] : [])], {
    cwd: projectDir,
    stdio: opts.inherit ? 'inherit' : 'pipe',
    timeout: 300000,
    onData: opts.inherit ? null : streamLine,
  });
}

/**
 * Run all tests piped (for fix loop consumption). Returns { allPass, testOutput }.
 */
async function runAllTestsPiped(projectDir, options) {
  let testOutput = '';
  let allPass = true;

  if (!options.e2e) {
    console.log('    Running Jest...');
    const result = await runJest(projectDir);
    if (result.status !== 0) {
      testOutput += 'JEST TEST FAILURES:\n' + (result.stdout || '') + '\n' + (result.stderr || '') + '\n\n';
      allPass = false;
    }
  }

  if (!options.unit) {
    const hasPlaywright = await fs.access(path.join(projectDir, 'playwright.config.js')).then(() => true).catch(() => false);
    if (hasPlaywright) {
      console.log('    Running Playwright...');
      const result = await runPlaywright(projectDir);
      if (result.status !== 0) {
        testOutput += 'PLAYWRIGHT E2E FAILURES:\n' + (result.stdout || '') + '\n' + (result.stderr || '') + '\n\n';
        allPass = false;
      }
    }
  }

  return { allPass, testOutput };
}

/**
 * Fix loop: send failures to Claude, verify, repeat.
 */
async function runFixLoop(projectDir, testOutput, options, loopNum) {
  const logDir = path.join(projectDir, 'forge', 'logs');
  await fs.mkdir(logDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const logFile = path.join(logDir, `${timestamp}-fix-loop${loopNum}.log`);

  const sp = createSpinner(`Fix loop ${loopNum}: Fixing failures`);
  const result = await runClaude(FIX_PREAMBLE + testOutput, {
    cwd: projectDir,
    maxTurns: 200,
    timeout: 30,
    logFile,
    spinner: sp,
    verbose: options.verbose || false,
  });

  if (result.status !== 0) {
    sp.fail(`Fix loop ${loopNum}: Fix attempt had errors (log: ${path.relative(projectDir, logFile)})`);
  } else {
    sp.succeed(`Fix loop ${loopNum}: Fix attempt completed (log: ${path.relative(projectDir, logFile)})`);
  }
}

async function handleTest(options) {
  const projectDir = process.cwd();
  const shouldFix = options.fix !== false; // default true
  const maxFixLoops = 100;

  // --unit: only Jest
  if (options.unit) {
    console.log('  Running server tests (Jest)...');
    console.log('');
    const result = await runJest(projectDir, { inherit: !shouldFix, coverage: options.coverage, watch: options.watch });

    if (result.status === 0 || !shouldFix) {
      process.exit(result.status || 0);
    }

    // Auto-fix loop
    console.log('');
    console.log('  Tests failed — auto-fixing (use --no-fix to skip)');
    let testOutput = 'JEST TEST FAILURES:\n' + (result.stdout || '') + '\n' + (result.stderr || '') + '\n\n';

    for (let loop = 1; loop <= maxFixLoops; loop++) {
      await runFixLoop(projectDir, testOutput, options, loop);

      const sp = createSpinner(`Fix loop ${loop}: Verifying`);
      const verify = await runJest(projectDir);
      if (verify.status === 0) {
        sp.succeed(`Fix loop ${loop}: All tests pass`);
        console.log('');
        console.log('  All tests pass. Done.');
        process.exit(0);
      }
      sp.fail(`Fix loop ${loop}: Still failing`);
      testOutput = 'JEST TEST FAILURES:\n' + (verify.stdout || '') + '\n' + (verify.stderr || '') + '\n\n';
    }
    process.exit(1);
  }

  // --e2e: only Playwright
  if (options.e2e) {
    console.log('  Running E2E tests (Playwright)...');
    console.log('');
    const result = await runPlaywright(projectDir, { inherit: !shouldFix, ui: options.ui });
    if (result.status === 0 || !shouldFix) {
      process.exit(result.status || 0);
    }

    console.log('');
    console.log('  E2E tests failed — auto-fixing (use --no-fix to skip)');
    let testOutput = 'PLAYWRIGHT E2E FAILURES:\n' + (result.stdout || '') + '\n' + (result.stderr || '') + '\n\n';

    for (let loop = 1; loop <= maxFixLoops; loop++) {
      await runFixLoop(projectDir, testOutput, options, loop);

      const sp = createSpinner(`Fix loop ${loop}: Verifying`);
      const verify = await runPlaywright(projectDir);
      if (verify.status === 0) {
        sp.succeed(`Fix loop ${loop}: All E2E tests pass`);
        console.log('');
        console.log('  All tests pass. Done.');
        process.exit(0);
      }
      sp.fail(`Fix loop ${loop}: Still failing`);
      testOutput = 'PLAYWRIGHT E2E FAILURES:\n' + (verify.stdout || '') + '\n' + (verify.stderr || '') + '\n\n';
    }
    process.exit(1);
  }

  // Default: run all (Jest then Playwright)
  console.log('  Running all tests...');
  console.log('');

  if (!shouldFix) {
    // No fix mode — run with inherited output
    console.log('  Running server tests (Jest)...');
    console.log('');
    const jest = await runJest(projectDir, { inherit: true, coverage: options.coverage, watch: options.watch });
    if (jest.status !== 0) {
      console.log('');
      console.log('  Jest tests failed. Skipping E2E.');
      process.exit(jest.status);
    }
    console.log('');
    console.log('  Running E2E tests (Playwright)...');
    console.log('');
    const pw = await runPlaywright(projectDir, { inherit: true });
    process.exit(pw.status || 0);
  }

  // Fix mode (default) — run piped, auto-fix on failure
  for (let loop = 1; loop <= maxFixLoops; loop++) {
    const sp = createSpinner(loop === 1 ? 'Running tests' : `Fix loop ${loop}: Running tests`);
    const { allPass, testOutput } = await runAllTestsPiped(projectDir, options);

    if (allPass) {
      sp.succeed(loop === 1 ? 'All tests pass' : `Fix loop ${loop}: All tests pass`);
      console.log('');
      console.log('  All tests pass. Done.');
      console.log('');
      process.exit(0);
    }

    sp.fail(loop === 1 ? 'Tests failed — auto-fixing' : `Fix loop ${loop}: Still failing`);

    if (loop === 1) {
      console.log('    (use --no-fix to just see results)');
    }

    await runFixLoop(projectDir, testOutput, options, loop);
  }

  console.log('');
  console.log(`  Tests still failing after ${maxFixLoops} fix loops.`);
  console.log('  Check logs in forge/logs/');
  console.log('');
  process.exit(1);
}

export function registerTestCommand(program) {
  program
    .command('test')
    .description('Run all tests and auto-fix failures')
    .option('--unit', 'Run only Jest unit tests')
    .option('--e2e', 'Run only Playwright E2E tests')
    .option('--no-fix', 'Just run tests without auto-fixing')
    .option('--coverage', 'Run Jest with coverage report')
    .option('--watch', 'Run Jest in watch mode')
    .option('--ui', 'Open Playwright UI (use with --e2e)')
    .option('--verbose', 'Show Claude activity during fix')
    .action(handleTest);
}
