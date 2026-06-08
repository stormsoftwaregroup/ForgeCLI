import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import { reviewPromptContent, enrichPrompt } from '../lib/review.js';
import { checkImproveAge } from './improve.js';
import { createSpinner } from '../lib/spinner.js';
import { runClaude } from '../lib/claude.js';
import { runCommand } from '../lib/run.js';

const RED_FLAG_PATTERNS = [
  // Incomplete implementation markers
  { pattern: /\bTODO\b/i, label: 'TODO comment' },
  { pattern: /\bFIXME\b/i, label: 'FIXME comment' },
  { pattern: /\bHACK\b/i, label: 'HACK comment' },
  { pattern: /\bXXX\b/, label: 'XXX marker' },
  // Deferred/stub patterns
  { pattern: /placeholder/i, label: 'placeholder reference' },
  { pattern: /\bstub\b/i, label: 'stub reference' },
  { pattern: /implement\s+later/i, label: '"implement later" pattern' },
  { pattern: /not\s+yet\s+implemented/i, label: '"not yet implemented" pattern' },
  { pattern: /coming\s+soon/i, label: '"coming soon" pattern' },
  { pattern: /\bdummy\b/i, label: 'dummy reference' },
  { pattern: /\bhardcoded\b/i, label: 'hardcoded reference' },
  { pattern: /in\s+a\s+follow[\s-]?up/i, label: '"in a follow-up" pattern' },
  { pattern: /out\s+of\s+scope/i, label: '"out of scope" pattern' },
  { pattern: /for\s+now[\s,]/i, label: '"for now" deferral' },
  { pattern: /skip(ped|ping)?\s+(this|for now)/i, label: 'skipped implementation' },
  // Empty/noop patterns
  { pattern: /throw\s+new\s+Error\(['"]not implemented['"]\)/i, label: 'not-implemented throw' },
  { pattern: /return\s+null;\s*\/\//, label: 'return null with comment (possible stub)' },
  { pattern: /\(\)\s*=>\s*\{\s*\}/, label: 'empty arrow function (possible noop)' },
];

const SCAN_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.json', '.css', '.html', '.sql', '.prisma',
]);

/**
 * Scan recently modified files in the project for red-flag patterns that indicate
 * incomplete or deferred implementation. Returns an array of findings.
 */
async function scanForRedFlags(projectDir, sinceMsAgo = 10 * 60 * 1000) {
  const cutoff = Date.now() - sinceMsAgo;
  const findings = [];

  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch { return; }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'forge'].includes(entry.name)) continue;
        await walk(fullPath);
      } else if (entry.isFile() && SCAN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        let stat;
        try { stat = await fs.stat(fullPath); } catch { continue; }
        if (stat.mtimeMs < cutoff) continue;

        let content;
        try { content = await fs.readFile(fullPath, 'utf-8'); } catch { continue; }

        const lines = content.split('\n');
        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
          for (const { pattern, label } of RED_FLAG_PATTERNS) {
            if (pattern.test(lines[lineNum])) {
              findings.push({
                file: path.relative(projectDir, fullPath),
                line: lineNum + 1,
                label,
                text: lines[lineNum].trim().slice(0, 120),
              });
            }
          }
        }
      }
    }
  }

  await walk(projectDir);
  return findings;
}

/**
 * Run a compliance check: scan for red flags and verify prompt requirements were met.
 * Returns { passed, findings, complianceOutput }.
 */
async function runComplianceCheck(projectDir, promptContent, logOutput, opts = {}) {
  // Step 1: Static scan for red flags
  const findings = await scanForRedFlags(projectDir);

  // Step 2: Ask Claude to verify the prompt was fully followed
  const compliancePrompt = `You are a strict code auditor. Your ONLY job is to verify that a build prompt was fully implemented.

Review the original prompt below and the build output, then check the project files to confirm EVERY requirement was implemented — not stubbed, not deferred, not partially done.

ORIGINAL PROMPT:
---
${promptContent}
---

BUILD OUTPUT (last 3000 chars):
---
${logOutput.slice(-3000)}
---

${findings.length > 0 ? `STATIC SCAN FOUND THESE RED FLAGS:\n${findings.map((f) => `  - ${f.file}:${f.line} — ${f.label}: ${f.text}`).join('\n')}\n\nInvestigate each one. Some may be false positives (e.g., "dummy" in a variable name for test data is fine).\n` : ''}
INSTRUCTIONS:
1. Read the key files that should have been created or modified by this prompt.
2. For each requirement in the prompt, verify it was actually implemented (not stubbed/skipped).
3. Check that any red flags above are actual problems vs false positives.
4. Output a structured report in this exact format:

COMPLIANCE REPORT
=================
Status: PASS | FAIL
Issues found: <number>

${findings.length > 0 ? 'RED FLAG REVIEW:\n- <file:line> — <REAL ISSUE | FALSE POSITIVE>: <explanation>\n' : ''}
MISSING/INCOMPLETE:
- <requirement from prompt that was not fully implemented>
- (or "None" if all requirements are met)

SUMMARY: <one line>

If everything is properly implemented and red flags are false positives, report PASS with 0 issues.
If anything is missing, stubbed, or deferred, report FAIL with the count and details.`;

  const complianceResult = await runClaude(compliancePrompt, {
    cwd: projectDir,
    maxTurns: opts.maxTurns || 20,
    logFile: opts.logFile,
  });

  const output = complianceResult.output || '';
  const passed = /Status:\s*PASS/i.test(output) && complianceResult.status === 0;
  const issueMatch = output.match(/Issues found:\s*(\d+)/i);
  const issueCount = issueMatch ? parseInt(issueMatch[1], 10) : (passed ? 0 : -1);

  return { passed, findings, issueCount, complianceOutput: output };
}

const SYSTEM_PREAMBLE = `SYSTEM INSTRUCTIONS — READ BEFORE DOING ANYTHING:

You are executing a build step for a Forge project. Follow these rules strictly:

1. IMPLEMENT EVERYTHING in this prompt. Do not skip, stub, defer, or partially implement
   any feature described below. Every entity, endpoint, page, and component must be fully
   functional when you are done.
2. Do not use placeholder data, dummy implementations, TODO comments, or "implement later"
   patterns. If the prompt says to create 10 sample spirits, create 10 real ones. If it
   says to build a step-by-step wizard, build all steps.
3. Do not ask questions. Do not pause for confirmation. Do not suggest alternatives.
   Execute the prompt exactly as written.
4. Do not split work into phases or suggest "this could be done in a follow-up."
   There is no follow-up. This is the only pass.
5. Do not worry about response length, token limits, or output size. Write as much code
   as needed to fully implement every requirement.
6. If you encounter an error, fix it yourself and continue. Do not stop to report it.
7. When the prompt says VERIFY, run those verification steps. If they fail, fix the
   issues until they pass, then move on.

THE PROMPT TO EXECUTE:
---
`;

/**
 * Split a single markdown file containing multiple prompts (delimited by ## Prompt headings)
 * into individual prompt objects. Extracts the content inside code fences if present.
 */
function splitMultiPromptFile(content, sourceFile) {
  const sections = [];
  const regex = /^## Prompt (\d+)\s*[—–-]?\s*(.*)/gm;
  const matches = [...content.matchAll(regex)];

  if (matches.length === 0) {
    // No ## Prompt headings — treat the whole file as one prompt
    return [{ name: path.basename(sourceFile, '.md'), content: content.trim() }];
  }

  for (let i = 0; i < matches.length; i++) {
    const num = matches[i][1].padStart(2, '0');
    const title = matches[i][2].trim();
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : content.length;
    let body = content.slice(start, end).trim();

    // Extract content from code fences if present
    const fenceMatch = body.match(/```[\s\S]*?\n([\s\S]*?)```/);
    if (fenceMatch) {
      body = fenceMatch[1].trim();
    }

    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 60);

    sections.push({
      name: `${num}-${slug || `prompt-${num}`}`,
      content: body,
    });
  }

  return sections;
}

async function handleBuild(options) {
  const projectDir = process.cwd();
  const promptDir = path.resolve(options.prompts || path.join(projectDir, 'forge', 'prompts'));
  const maxRetries = options.maxRetries ? parseInt(options.maxRetries, 10) : 3;

  await checkImproveAge(projectDir);

  // Read prompt files
  let allFiles;
  try {
    allFiles = await fs.readdir(promptDir);
  } catch (err) {
    console.error(`Error: Cannot read prompts directory: ${promptDir}`);
    console.error(err.message);
    process.exit(1);
  }

  const mdFiles = allFiles
    .filter((f) => f.endsWith('.md') && !f.endsWith('.reviewed.md'))
    .sort();

  if (mdFiles.length === 0) {
    console.error('Error: No .md prompt files found in', promptDir);
    process.exit(1);
  }

  // Build the prompt list — auto-split multi-prompt files
  let prompts = [];
  for (const file of mdFiles) {
    const filePath = path.join(promptDir, file);
    const content = await fs.readFile(filePath, 'utf-8');
    const sections = splitMultiPromptFile(content, file);

    if (sections.length > 1) {
      console.log(`  Found ${sections.length} prompts in ${file}`);
      for (const sec of sections) {
        prompts.push({
          name: sec.name,
          content: sec.content,
          sourceFile: file,
          sourcePath: filePath,
        });
      }
    } else {
      prompts.push({
        name: path.basename(file, '.md'),
        content: sections[0].content,
        sourceFile: file,
        sourcePath: filePath,
      });
    }
  }

  // Filter by phase if specified
  if (options.phase) {
    const prefix = `P${options.phase}-`;
    const prefixAlt = `${options.phase.padStart(2, '0')}-`;
    prompts = prompts.filter((p) => p.name.startsWith(prefix) || p.name.startsWith(prefixAlt));
    if (prompts.length === 0) {
      console.error(`Error: No prompts found for phase ${options.phase}`);
      process.exit(1);
    }
  }

  // Resume from a specific step
  if (options.from) {
    const idx = prompts.findIndex((p) => p.name.includes(options.from));
    if (idx < 0) {
      console.error(`Error: No prompt matching "${options.from}" found`);
      process.exit(1);
    }
    prompts = prompts.slice(idx);
  }

  // Dry run — just list prompts
  if (options.dryRun) {
    console.log('');
    console.log('  Prompts to execute:');
    prompts.forEach((p, i) => console.log(`    ${i + 1}. ${p.name}`));
    console.log('');
    return;
  }

  // Review stage — auto-apply reference implementation for conflicts, enrich with template requirements
  console.log('');
  console.log('  Reviewing prompts against template capabilities...');

  const promptsToRun = [];

  for (const p of prompts) {
    const content = p.content || '';
    const { conflicts } = reviewPromptContent(content);

    let finalContent = content;

    if (conflicts.length > 0 && !options.skipReview) {
      // Auto-apply RI for all conflicts — no interactive prompting
      for (const c of conflicts) {
        console.log(`    ${p.name}: overriding "${c.matchedTerms.join('", "')}" → ${c.capability.tech}`);
        for (const term of c.matchedTerms) {
          const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`^(.*${escaped}.*)$`, 'gim');
          finalContent = finalContent.replace(regex, '<!-- OVERRIDDEN: $1 -->');
        }
      }
      const conventions = conflicts.map((c) =>
        `- Use ${c.capability.tech} for ${c.capability.name.toLowerCase()}${c.capability.files.length ? ` (see ${c.capability.files.join(', ')})` : ''}\n  Do NOT: ${c.matchedTerms.join(', ')}`
      );
      finalContent += `\n\nTEMPLATE OVERRIDES:\n${conventions.join('\n')}\n`;
    }

    // Enrich with template requirements
    finalContent = enrichPrompt(finalContent);

    promptsToRun.push({ file: p.name, path: p.sourcePath, content: finalContent, reviewed: conflicts.length > 0 });
  }

  // Auto-inject test prompts if none exist in the prompt set
  if (!options.skipReview) {
    const allContent = promptsToRun.map((p) => p.content).join('\n').toLowerCase();
    const hasUnitTests = /\b(jest|supertest|\.test\.js|server\/tests)\b/.test(allContent);
    const hasE2eTests = /\b(playwright|\.spec\.js|e2e\/|end.to.end)\b/.test(allContent);
    const hasClientTests = /\b(component test|react testing|render\(|screen\.|vitest.*client)\b/.test(allContent);

    const missingTests = [];

    if (!hasUnitTests) {
      missingTests.push('unit');
      const unitPrompt = `Write comprehensive Jest + Supertest unit tests for ALL API endpoints and services in this project.

INSTRUCTIONS:
1. Read every route file in server/src/routes/ to discover all endpoints.
2. Read every service file in server/src/services/ to understand business logic.
3. For each endpoint, write tests covering:
   - Happy path (valid request → expected response)
   - Authentication (protected routes return 401 without token)
   - Authorization (role-based routes return 403 for wrong role)
   - Validation (invalid input returns 400 with error details)
   - Not found cases (return 404)
   - Edge cases specific to the business logic
4. Place test files in server/tests/ following the pattern: <resource>.test.js
5. Use the existing test setup in server/tests/setup.js and server/tests/helpers.js
6. Use the test database (.env.test) — do NOT mock the database.
7. Follow the patterns in existing tests (auth.test.js, admin.test.js) for setup/teardown.

VERIFY:
- Run \`npm test\` and ensure all tests pass
- Every route file should have a corresponding test file
- Each test file should have at least 5 test cases`;

      promptsToRun.push({
        file: 'auto-unit-tests',
        path: null,
        content: enrichPrompt(unitPrompt),
        reviewed: true,
      });
      console.log('    auto-injected: unit tests (Jest + Supertest)');
    }

    if (!hasE2eTests) {
      missingTests.push('e2e');
      const e2ePrompt = `Write comprehensive Playwright E2E tests for ALL user-facing pages and workflows in this project.

INSTRUCTIONS:
1. Read client/src/App.jsx to discover all routes and pages.
2. Read the page components to understand user workflows.
3. For each page/workflow, write E2E tests covering:
   - Page loads and displays expected content
   - Forms submit correctly and show success/error feedback
   - Navigation between pages works
   - Authentication flows (login, register, logout)
   - Protected pages redirect unauthenticated users
   - CRUD operations (create, read, update, delete) through the UI
   - Loading states and empty states
4. Place test files in e2e/ following the pattern: <feature>.spec.js
5. Use the existing helpers in e2e/helpers/ for login/register operations.
6. Tests run against http://localhost:5173 (client) and http://localhost:3001 (server).
7. Use Chromium only (already configured in playwright.config.js).
8. Take screenshots at key points using \`await page.screenshot({ path: 'test-results/<name>.png' })\`

VERIFY:
- Run \`npx playwright test\` and ensure all tests pass
- Every major page should have at least one E2E test
- Auth flows (login, register, logout) must be tested`;

      promptsToRun.push({
        file: 'auto-e2e-tests',
        path: null,
        content: enrichPrompt(e2ePrompt),
        reviewed: true,
      });
      console.log('    auto-injected: E2E tests (Playwright)');
    }

    if (missingTests.length > 0) {
      console.log(`    (${missingTests.join(' + ')} test prompts were missing from the prompt set)`);
    }
  }

  if (promptsToRun.length === 0) {
    console.log('  No prompts to execute.');
    return;
  }

  // Create log directory
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const logDir = path.join(projectDir, 'forge', 'logs', timestamp);
  await fs.mkdir(logDir, { recursive: true });

  console.log('');
  console.log('  Starting build execution...');
  console.log(`  Prompts: ${promptsToRun.length}`);
  console.log(`  Logs:    ${path.relative(projectDir, logDir)}`);
  console.log('');

  const results = [];

  // Execute each prompt — no user interaction from here on
  for (let i = 0; i < promptsToRun.length; i++) {
    const prompt = promptsToRun[i];
    const stepName = prompt.file.replace('.reviewed', '').replace('.md', '');
    const logFile = path.join(logDir, `${stepName}.log`);

    console.log(`  [${i + 1}/${promptsToRun.length}] ${prompt.file}`);

    // Use inline content if available (multi-prompt file), otherwise read from file
    const content = prompt.content || await fs.readFile(prompt.path, 'utf-8');
    const fullPrompt = SYSTEM_PREAMBLE + content;

    let success = false;
    let attempts = 0;

    const sp = createSpinner(`Executing: ${prompt.file}`);

    while (!success && attempts < maxRetries) {
      attempts++;

      const result = await runClaude(fullPrompt, { cwd: projectDir, maxTurns: options.maxTurns, timeout: options.timeout, logFile, spinner: sp, verbose: options.verbose });

      if (result.status !== 0) {
        sp.update(`${prompt.file} — attempt ${attempts} failed, retrying`);

        if (options.autoFix && attempts < maxRetries) {
          const errorTail = result.output.slice(-2000);
          const fixPrompt =
            SYSTEM_PREAMBLE +
            `The previous build step produced errors. Fix ALL of them:\n\n${errorTail}\n\nOriginal prompt for context:\n${content}`;

          const fixResult = await runClaude(fixPrompt, { cwd: projectDir, maxTurns: options.maxTurns, timeout: options.timeout, spinner: sp, verbose: options.verbose });
          await fs.appendFile(logFile, `\n--- AUTO-FIX ATTEMPT ${attempts} ---\n${fixResult.output}`, 'utf-8');

          if (fixResult.status === 0) {
            success = true;
          }
        }
      } else {
        success = true;
      }
    }

    // Compliance check — scan for red flags and verify prompt was followed
    if (success && !options.skipCompliance) {
      sp.update(`Compliance check: ${prompt.file}`);

      const complianceLogFile = path.join(logDir, `${stepName}-compliance.log`);
      const lastOutput = await fs.readFile(logFile, 'utf-8').catch(() => '');

      const compliance = await runComplianceCheck(projectDir, content, lastOutput, {
        maxTurns: 20,
        logFile: complianceLogFile,
      });

      if (!compliance.passed) {
        await fs.appendFile(logFile, `\n--- COMPLIANCE CHECK FAILED (${compliance.issueCount} issues) ---\n${compliance.complianceOutput}\n`, 'utf-8');

        if (compliance.findings.length > 0) {
          console.log('');
          console.log(`    Red flags found:`);
          for (const f of compliance.findings.slice(0, 10)) {
            console.log(`      ${f.file}:${f.line} — ${f.label}`);
          }
          if (compliance.findings.length > 10) {
            console.log(`      ... and ${compliance.findings.length - 10} more`);
          }
        }

        // Auto-fix: send the compliance report back to Claude to address
        if (attempts < maxRetries) {
          sp.update(`Fixing compliance issues: ${prompt.file}`);
          attempts++;

          const fixPrompt =
            SYSTEM_PREAMBLE +
            `A compliance check found that the previous build step did NOT fully implement the prompt requirements.\n\n` +
            `COMPLIANCE REPORT:\n${compliance.complianceOutput.slice(-3000)}\n\n` +
            `ORIGINAL PROMPT:\n${content}\n\n` +
            `Fix ALL issues identified in the compliance report. Implement everything that was missed, ` +
            `remove all TODO/FIXME/placeholder/stub patterns, and ensure every requirement from the original prompt is fully working.`;

          const fixResult = await runClaude(fixPrompt, { cwd: projectDir, maxTurns: options.maxTurns, timeout: options.timeout, logFile, spinner: sp, verbose: options.verbose });
          await fs.appendFile(logFile, `\n--- COMPLIANCE FIX ATTEMPT ---\n${fixResult.output}`, 'utf-8');

          if (fixResult.status !== 0) {
            success = false;
          }
          // After fix, we accept the result — the next step's compliance check or --verify will catch remaining issues
        } else {
          success = false;
        }
      } else {
        await fs.appendFile(logFile, `\n--- COMPLIANCE CHECK PASSED ---\n`, 'utf-8');
      }
    }

    // Verify step (if --verify flag)
    if (success && options.verify) {
      sp.update(`Verifying: ${prompt.file}`);

      const testResult = await runCommand('npm', ['test', '--', '--forceExit'], {
        cwd: projectDir,
        timeout: 120000,
      });

      if (testResult.status !== 0) {
        await fs.appendFile(logFile, `\n--- VERIFY FAILED ---\n${testResult.stdout}\n${testResult.stderr}\n`, 'utf-8');

        if (options.autoFix && attempts < maxRetries) {
          sp.update(`Auto-fixing test failures: ${prompt.file}`);
          const errorOutput = (testResult.stdout || '') + '\n' + (testResult.stderr || '');
          const fixPrompt =
            SYSTEM_PREAMBLE +
            `Tests are failing after implementing the previous step. Fix ALL failures:\n\n${errorOutput.slice(-3000)}`;

          await runClaude(fixPrompt, { cwd: projectDir, maxTurns: options.maxTurns, timeout: options.timeout, spinner: sp, verbose: options.verbose });
        } else {
          success = false;
        }
      }
    }

    const status = success ? 'OK' : 'FAILED';
    if (success) {
      sp.succeed(`${prompt.file}`);
    } else {
      sp.fail(`${prompt.file}`);
    }
    results.push({ step: stepName, status, logFile });

    // Move completed prompt to done/ folder
    // For multi-prompt files, only move the source file after the LAST section from it completes
    if (success) {
      const doneDir = path.join(promptDir, 'done');
      await fs.mkdir(doneDir, { recursive: true });

      const isMulti = promptsToRun.filter((p) => p.path === prompt.path).length > 1;
      const isLastFromFile = !promptsToRun.slice(i + 1).some((p) => p.path === prompt.path);

      if (!isMulti) {
        // Single-prompt file — move it
        await fs.rename(prompt.path, path.join(doneDir, path.basename(prompt.path)));
        if (prompt.reviewed) {
          const originalFile = prompt.file.replace('.reviewed.md', '.md');
          const originalPath = path.join(promptDir, originalFile);
          try {
            await fs.rename(originalPath, path.join(doneDir, originalFile));
          } catch { /* original may not exist */ }
        }
      } else if (isLastFromFile) {
        // Last section from a multi-prompt file — move the source file
        try {
          await fs.rename(prompt.path, path.join(doneDir, path.basename(prompt.path)));
        } catch { /* may already be moved if sections share a file */ }
      }
    }

    if (!success) {
      console.log('');
      console.log(`  Build stopped at step: ${stepName}`);
      console.log(`  Log: ${logFile}`);
      console.log(`  To resume: forge build --prompts ${promptDir} --resume --from ${stepName}`);
      break;
    }
  }

  // Post-build finalization — install deps, migrate, run tests
  const allPassed = results.every((r) => r.status === 'OK');

  if (allPassed && results.length > 0) {
    console.log('');
    console.log('  Post-build setup...');

    // npm install — prompts may have added new dependencies
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

    // Prisma migrate — prompts may have added new models
    const serverDir = path.join(projectDir, 'server');
    const hasPrisma = await fs.access(path.join(serverDir, 'prisma', 'schema.prisma')).then(() => true).catch(() => false);

    if (hasPrisma) {
      sp = createSpinner('Running database migration');
      const migrateResult = await runCommand('npx', ['prisma', 'migrate', 'dev', '--name', 'post-build'], {
        cwd: serverDir,
        timeout: 60000,
      });
      if (migrateResult.status === 0) {
        sp.succeed('Migration complete');
      } else {
        sp.fail('Migration failed (you may need to run manually: cd server && npx prisma migrate dev)');
      }

      // Prisma generate — ensure client is up to date
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

    // Install Playwright browsers
    const hasPlaywright = await fs.access(path.join(projectDir, 'playwright.config.js')).then(() => true).catch(() => false);
    if (hasPlaywright) {
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
    }

    // Test + fix loop — run all tests, if any fail, send to Claude to fix, repeat
    const maxFixLoops = 100;
    for (let fixLoop = 1; fixLoop <= maxFixLoops; fixLoop++) {
      let testOutput = '';
      let testsFailed = false;

      // Jest
      sp = createSpinner(`Test loop ${fixLoop}: Running server tests`);
      const jestResult = await runCommand('npm', ['test', '--', '--forceExit'], {
        cwd: projectDir,
        timeout: 120000,
      });
      if (jestResult.status === 0) {
        sp.succeed(`Test loop ${fixLoop}: Server tests passed`);
      } else {
        sp.fail(`Test loop ${fixLoop}: Server tests failed`);
        testOutput += 'JEST TEST FAILURES:\n' + (jestResult.stdout || '') + '\n' + (jestResult.stderr || '') + '\n\n';
        testsFailed = true;
      }

      // Playwright
      if (hasPlaywright) {
        sp = createSpinner(`Test loop ${fixLoop}: Running E2E tests`);
        const pwResult = await runCommand('npx', ['playwright', 'test'], {
          cwd: projectDir,
          timeout: 300000,
        });
        if (pwResult.status === 0) {
          sp.succeed(`Test loop ${fixLoop}: E2E tests passed`);
        } else {
          sp.fail(`Test loop ${fixLoop}: E2E tests failed`);
          testOutput += 'PLAYWRIGHT E2E FAILURES:\n' + (pwResult.stdout || '') + '\n' + (pwResult.stderr || '') + '\n\n';
          testsFailed = true;
        }
      }

      if (!testsFailed) {
        console.log('  All tests pass!');
        break;
      }

      if (fixLoop >= maxFixLoops) {
        console.log(`  Tests still failing after ${maxFixLoops} fix loops.`);
        console.log('  Run: forge fix');
        break;
      }

      // Send failures to Claude for fixing
      sp = createSpinner(`Test loop ${fixLoop}: Auto-fixing failures`);
      const fixPrompt = `SYSTEM INSTRUCTIONS — READ BEFORE DOING ANYTHING:

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
${testOutput}`;

      const fixLogFile = path.join(logDir, `_post-build-fix-loop${fixLoop}.log`);
      const fixResult = await runClaude(fixPrompt, {
        cwd: projectDir,
        maxTurns: parseInt(options.maxTurns, 10) || 200,
        timeout: parseInt(options.timeout, 10) || 30,
        logFile: fixLogFile,
        spinner: sp,
        verbose: options.verbose || false,
      });

      if (fixResult.status !== 0) {
        sp.fail(`Test loop ${fixLoop}: Fix attempt had errors`);
      } else {
        sp.succeed(`Test loop ${fixLoop}: Fix attempt completed`);
      }
    }
  }

  // Summary
  console.log('');
  console.log('  Build Summary:');
  for (const r of results) {
    const icon = r.status === 'OK' ? '+' : 'X';
    console.log(`    [${icon}] ${r.step}`);
  }
  console.log(`  Logs: ${path.relative(projectDir, logDir)}`);
  console.log('');
}

async function handleIssue(options) {
  const issueNum = options.fromIssue;
  const repo = options.repo;

  if (!repo) {
    console.error('Error: --repo <owner/repo> is required with --from-issue');
    process.exit(1);
  }

  const projectDir = process.cwd();

  // Fetch the issue
  let issue;
  try {
    const raw = execSync(`gh issue view ${issueNum} --repo ${repo} --json number,title,body`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    issue = JSON.parse(raw);
  } catch (err) {
    console.error(`Error: Could not fetch issue #${issueNum} from ${repo}`);
    console.error(err.message);
    process.exit(1);
  }

  console.log('');
  console.log(`  Issue #${issue.number}: ${issue.title}`);
  console.log(`  Repo:  ${repo}`);
  console.log(`  Dir:   ${projectDir}`);
  console.log('');

  // Add in-progress label
  try {
    execSync(`gh issue edit ${issueNum} --repo ${repo} --add-label "in-progress"`, {
      stdio: 'pipe',
    });
  } catch {
    // Label may not exist yet — create it and retry
    try {
      execSync(`gh label create "in-progress" --repo ${repo} --color FBCA04 --description "Being worked on by automation"`, { stdio: 'pipe' });
      execSync(`gh issue edit ${issueNum} --repo ${repo} --add-label "in-progress"`, { stdio: 'pipe' });
    } catch { /* best effort */ }
  }

  // Ensure we're on main and up to date
  let sp = createSpinner('Preparing workspace');
  try {
    execSync('git checkout main && git pull', { cwd: projectDir, stdio: 'pipe' });
    sp.succeed('Workspace ready (main, up to date)');
  } catch {
    try {
      execSync('git checkout master && git pull', { cwd: projectDir, stdio: 'pipe' });
      sp.succeed('Workspace ready (master, up to date)');
    } catch (err) {
      sp.fail('Could not update workspace');
      console.error(err.message);
      process.exit(1);
    }
  }

  // Create feature branch
  const branchName = `feature/issue-${issueNum}`;
  try {
    execSync(`git checkout -b ${branchName}`, { cwd: projectDir, stdio: 'pipe' });
  } catch {
    // Branch may already exist
    execSync(`git checkout ${branchName}`, { cwd: projectDir, stdio: 'pipe' });
  }

  // Create log directory
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const logDir = path.join(projectDir, 'forge', 'logs', timestamp);
  await fs.mkdir(logDir, { recursive: true });
  const logFile = path.join(logDir, `issue-${issueNum}.log`);

  // Build the prompt
  const prompt = `SYSTEM INSTRUCTIONS — READ BEFORE DOING ANYTHING:

You are a senior engineer. A GitHub issue has been assigned to you.
Your job: turn this issue into a production-ready Pull Request.
No human will intervene. You own every step.

Do not ask questions. Do not pause for confirmation. Do not suggest alternatives.
If the issue is vague, fill in the gaps yourself — write acceptance criteria,
define scope, state assumptions, identify edge cases. You are the engineer. Decide and build.

ISSUE #${issue.number}: ${issue.title}
---
${issue.body || '(no description)'}
---

INSTRUCTIONS:

1. Read CLAUDE.md for project conventions. Explore the codebase to understand
   relevant files and patterns.

2. Plan your implementation. Decide which files to change, which patterns
   to follow, what tests to write. Do not post the plan — just do it.

3. Implement the code. Follow existing patterns. Commit atomically with
   conventional commit messages referencing issue #${issue.number}.

4. Write tests:
   - Unit tests for new functions
   - Integration tests for service interactions
   - E2E tests with Playwright for UI changes
   - Run the full test suite. If tests fail, fix and re-run.

5. Use Playwright MCP to visually verify UI changes if applicable.

6. Self-review your work. Read your own diff. Look for missed edge cases,
   unclear naming, unnecessary complexity, missing error handling, incomplete
   tests, security issues, accessibility gaps. Fix anything you would flag
   in a code review. Repeat until satisfied.

7. Push the branch and create a PR:
   - git push -u origin ${branchName}
   - Create a PR with title referencing issue #${issue.number}
   - PR body should include: Closes #${issue.number}, summary of changes, what was tested
   - Comment on issue #${issue.number} with the PR link:
     gh issue comment ${issueNum} --repo ${repo} --body "PR created: <url>"

8. If you genuinely cannot proceed (repo won't build, tests fundamentally
   broken), comment on the issue explaining what blocked you.`;

  console.log(`  Logs: ${path.relative(projectDir, logFile)}`);
  console.log('');

  sp = createSpinner(`Building issue #${issueNum}`);

  const result = await runClaude(prompt, {
    cwd: projectDir,
    maxTurns: parseInt(options.maxTurns, 10) || 200,
    timeout: parseInt(options.timeout, 10) || 120,
    logFile,
    spinner: sp,
    verbose: options.verbose || false,
  });

  if (result.status === 0) {
    sp.succeed(`Issue #${issueNum} complete`);
  } else {
    sp.fail(`Issue #${issueNum} failed`);
    // Add agent-failed label
    try {
      execSync(`gh label create "agent-failed" --repo ${repo} --color D93F0B --description "Automation failed"`, { stdio: 'pipe' });
    } catch { /* may exist */ }
    try {
      execSync(`gh issue edit ${issueNum} --repo ${repo} --add-label "agent-failed"`, { stdio: 'pipe' });
      execSync(`gh issue comment ${issueNum} --repo ${repo} --body "Automation failed. Check logs for details."`, { stdio: 'pipe' });
    } catch { /* best effort */ }
  }

  console.log('');
  console.log(`  Log: ${logFile}`);
  console.log('');
}

export function registerBuildCommand(program) {
  program
    .command('build')
    .description('Run prompt files sequentially via Claude Code')
    .option('--prompts <dir>', 'Path to prompts directory (default: forge/prompts)')
    .option('--verify', 'Run tests after each step')
    .option('--phase <N>', 'Run only prompts for a specific phase')
    .option('--resume', 'Resume from a specific step')
    .option('--from <step>', 'Step name to resume from')
    .option('--auto-fix', 'Attempt auto-fix on failures')
    .option('--max-retries <N>', 'Max retry attempts per step (default: 3)', '3')
    .option('--dry-run', 'List prompts without executing')
    .option('--skip-review', 'Skip the prompt review stage')
    .option('--max-turns <N>', 'Max Claude turns per prompt (default: 200)', '200')
    .option('--skip-compliance', 'Skip the post-step compliance check')
    .option('--timeout <minutes>', 'Max minutes per step before killing (default: 30)', '30')
    .option('--verbose', 'Show real-time Claude tool activity in console')
    .option('--from-issue <number>', 'Build from a GitHub issue number')
    .option('--repo <owner/repo>', 'GitHub repo for --from-issue')
    .action((options) => {
      if (options.fromIssue) {
        return handleIssue(options);
      }
      return handleBuild(options);
    });
}
