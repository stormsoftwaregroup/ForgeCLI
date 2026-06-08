import fs from 'fs/promises';
import path from 'path';
import { createSpinner } from '../lib/spinner.js';
import { runCommand } from '../lib/run.js';

async function handleSetup(options) {
  const projectDir = process.cwd();

  console.log('');
  console.log('  Running project setup...');
  console.log('');

  // npm install
  let sp = createSpinner('Installing dependencies');
  const npmResult = await runCommand('npm', ['install'], {
    cwd: projectDir,
    timeout: 300000,
  });
  if (npmResult.status === 0) {
    sp.succeed('Dependencies installed');
  } else {
    sp.fail('npm install failed');
    const errOut = (npmResult.stderr || '').trim();
    if (errOut) console.log(`    ${errOut.split('\n')[0]}`);
  }

  // Prisma migrate
  const serverDir = path.join(projectDir, 'server');
  const hasPrisma = await fs.access(path.join(serverDir, 'prisma', 'schema.prisma')).then(() => true).catch(() => false);

  if (hasPrisma) {
    sp = createSpinner('Running database migration');
    const migrateResult = await runCommand('npx', ['prisma', 'migrate', 'dev', '--name', 'setup'], {
      cwd: serverDir,
      timeout: 60000,
    });
    if (migrateResult.status === 0) {
      sp.succeed('Migration complete');
    } else {
      sp.fail('Migration failed');
      const errOut = (migrateResult.stderr || '').trim();
      if (errOut) console.log(`    ${errOut.split('\n').slice(-3).join('\n    ')}`);
    }

    sp = createSpinner('Generating Prisma client');
    const genResult = await runCommand('npx', ['prisma', 'generate'], {
      cwd: serverDir,
      timeout: 30000,
    });
    if (genResult.status === 0) {
      sp.succeed('Prisma client generated');
    } else {
      sp.fail('Prisma generate failed');
    }
  }

  // Run tests unless --skip-tests
  if (!options.skipTests) {
    sp = createSpinner('Running server tests');
    const testResult = await runCommand('npm', ['test', '--', '--forceExit'], {
      cwd: projectDir,
      stdio: options.showOutput ? 'inherit' : 'pipe',
      timeout: 120000,
    });
    if (testResult.status === 0) {
      sp.succeed('Server tests passed');
    } else {
      sp.fail('Server tests failed');
      if (!options.showOutput) {
        const out = (testResult.stdout || '') + '\n' + (testResult.stderr || '');
        const logFile = path.join(projectDir, 'forge', 'logs', 'setup-tests.log');
        await fs.mkdir(path.dirname(logFile), { recursive: true });
        await fs.writeFile(logFile, out, 'utf-8');
        console.log(`    Test output: ${path.relative(projectDir, logFile)}`);
      }
    }

    // Playwright
    const hasPlaywright = await fs.access(path.join(projectDir, 'playwright.config.js')).then(() => true).catch(() => false);

    if (hasPlaywright && !options.skipE2e) {
      sp = createSpinner('Installing Playwright browsers');
      const pwInstall = await runCommand('npx', ['playwright', 'install', 'chromium'], {
        cwd: projectDir,
        timeout: 120000,
      });
      if (pwInstall.status === 0) {
        sp.succeed('Playwright browsers installed');
      } else {
        sp.fail('Playwright browser install failed');
      }

      sp = createSpinner('Running E2E tests (Playwright)');
      const e2eResult = await runCommand('npx', ['playwright', 'test'], {
        cwd: projectDir,
        stdio: options.showOutput ? 'inherit' : 'pipe',
        timeout: 300000,
      });
      if (e2eResult.status === 0) {
        sp.succeed('E2E tests passed');
      } else {
        sp.fail('E2E tests failed');
        if (!options.showOutput) {
          const out = (e2eResult.stdout || '') + '\n' + (e2eResult.stderr || '');
          const logFile = path.join(projectDir, 'forge', 'logs', 'setup-e2e.log');
          await fs.mkdir(path.dirname(logFile), { recursive: true });
          await fs.writeFile(logFile, out, 'utf-8');
          console.log(`    E2E output: ${path.relative(projectDir, logFile)}`);
        }
      }
    }
  }

  console.log('');
  console.log('  Setup complete.');
  console.log('');
}

export function registerSetupCommand(program) {
  program
    .command('setup')
    .description('Install deps, run migrations, and run tests')
    .option('--skip-tests', 'Skip running tests')
    .option('--skip-e2e', 'Skip Playwright E2E tests')
    .option('--show-output', 'Show test output directly instead of logging to file')
    .action(handleSetup);
}
