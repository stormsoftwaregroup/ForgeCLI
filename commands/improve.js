import fs from 'fs/promises';
import path from 'path';
import { createSpinner } from '../lib/spinner.js';
import { runClaude } from '../lib/claude.js';
import { runCommand } from '../lib/run.js';

const SCAN_PREAMBLE = `SYSTEM INSTRUCTIONS — READ BEFORE DOING ANYTHING:

You are a senior architect and principal engineer. Your job is to verify this application
ACTUALLY WORKS end-to-end, then scan for deeper issues. Produce a prioritized findings report.

IMPORTANT: The #1 priority is FUNCTIONAL CORRECTNESS. A secure, accessible, well-architected
app that shows a blank page is worthless. Verify the app works FIRST.

SCAN IN THIS ORDER:

1. FUNCTIONAL VERIFICATION (CRITICAL) — This is the most important step. Trace every
   user-facing flow from start to finish:
   a) ROUTES: Trace every route definition in the backend (Express router files) and
      every route in the frontend (React Router). Verify they match. Check that:
      - Every frontend page that calls an API endpoint is calling the correct path
      - Every API endpoint that the frontend expects actually exists
      - Route parameters match between frontend and backend (:id vs :projectId etc.)
      - Middleware is applied correctly (auth, CSRF, validation)
   b) DATA FLOW: For each page, trace the full data flow:
      - Component mounts → API call → backend handler → database query → response → render
      - Verify the response shape matches what the frontend component expects
      - Check that the frontend actually renders the data (not just fetches it)
      - Look for silent failures: catch blocks that swallow errors, empty state vs error
        state confusion, loading states that never resolve
   c) FORMS: For every form in the frontend:
      - Verify the submit handler sends data in the format the backend expects
      - Check validation runs on both sides (client + server)
      - Verify success/error feedback is shown to the user
      - Check redirects after successful submission go to real routes
   d) AUTH FLOW: Trace the complete auth lifecycle:
      - Registration: form → API → database → token → redirect → authenticated state
      - Login: form → API → verify credentials → token → redirect → authenticated state
      - Token refresh: expired token → refresh call → new token → retry original request
      - Logout: clear token → redirect → unauthenticated state
      - Protected routes: unauthenticated access → redirect to login
      - Verify CSRF tokens are sent on state-changing requests
   e) BLANK PAGES: For every frontend page/component, verify it renders content:
      - Check that API calls are made on mount (useEffect hooks)
      - Check that loading/error/empty states are handled
      - Check that conditional rendering logic is correct (don't hide content by accident)
      - Look for components that import data but never display it

2. INTEGRATION ISSUES (CRITICAL) — Things that break when parts connect:
   - Frontend expects field "name" but backend sends "title"
   - API returns { data: [...] } but frontend reads response.items
   - Database schema has required fields that the API doesn't validate
   - TYPE MISMATCHES: Check the Prisma schema (or database migrations) against the
     code. If the schema defines a field as String/TEXT but the code generates or
     validates UUIDs, that's a mismatch. If the schema uses UUID but the code sends
     plain text, that's a mismatch. Compare: Prisma schema types ↔ Zod/validation
     schemas ↔ API request/response shapes ↔ frontend TypeScript types. They must
     all agree.
   - Middleware ordering issues (CSRF before cookie-parser, auth before CORS, etc.)
   - Environment variables referenced but not set in .env files
   - Import paths that don't resolve (wrong case, missing extension, wrong relative path)
   - WIRING GAPS: Every backend API endpoint should be called from the frontend.
     Every frontend action that needs data should have a backend endpoint. Check:
     - List all API routes defined in the backend → verify each one is called somewhere
       in the frontend code
     - List all API calls in the frontend → verify each one maps to a real backend route
     - Look for backend features that are fully implemented but never exposed to the
       user (e.g. export endpoint exists but no export button, search endpoint exists
       but no search UI, admin routes exist but no admin page)
     - Look for frontend UI that calls endpoints that don't exist or are incomplete
     - Check that navigation links/buttons point to routes that exist and render content

3. SECURITY VULNERABILITIES (HIGH) — SQL injection, XSS, CSRF gaps, auth bypasses,
   exposed secrets, missing input sanitization, improper access control

4. CRITICAL BUGS — Race conditions, data loss, unhandled promise rejections that crash
   the process, memory leaks, incorrect auth checks, broken error handling

5. ACCESSIBILITY — Missing ARIA labels, missing alt text, keyboard navigation gaps,
   color contrast issues, missing focus management, missing form labels

6. PERFORMANCE — N+1 queries, missing database indexes, unnecessary re-renders,
   blocking operations, large bundle imports, missing pagination

7. CODE QUALITY — Dead code, duplicated logic, overly complex functions, missing
   error handling at system boundaries, inconsistent patterns

8. RECOMMENDATIONS — Think like a principal engineer:
   - Missing functionality users would expect
   - UX improvements (loading states, error feedback, empty states, confirmation dialogs)
   - Developer experience improvements
   - Scalability concerns

OUTPUT FORMAT — Write a markdown file with EXACTLY this structure:

# Code Improvement Report

**Generated:** YYYY-MM-DD
**Project:** {project name from package.json}
**Files Scanned:** {count}

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | N |
| HIGH     | N |
| MEDIUM   | N |
| LOW      | N |
| RECOMMENDATIONS | N |

## CRITICAL

### C-001: {title}
- **File:** {relative path}:{line number}
- **Category:** {Functional|Integration|Security|Bug|Accessibility}
- **Description:** {what the issue is and why it matters}
- **Current Code:**
\`\`\`js
{the problematic code}
\`\`\`
- **Recommended Fix:**
\`\`\`js
{the corrected code}
\`\`\`

### C-002: ...

## HIGH

### H-001: ...

## MEDIUM

### M-001: ...

## LOW

### L-001: ...

## RECOMMENDATIONS

### R-001: {title}
- **Area:** {Architecture|Functionality|UX|DevEx|Scalability}
- **Description:** {what's missing or could be better}
- **Why it matters:** {the impact of not doing this}
- **Suggested approach:** {concrete steps to implement, not vague advice — include
  file paths, function signatures, component names}
- **Effort:** {Small|Medium|Large}

### R-002: ...

RULES:
1. Scan EVERY file in the project. Do not skip files or directories.
2. Actually READ the code — do not guess based on file names.
3. Trace data flows end-to-end. Do not assume something works because it looks right.
4. Be specific. Include file paths, line numbers, and actual code snippets.
5. Every finding must have a concrete recommended fix, not vague advice.
6. A blank page, broken route, or silent API failure is ALWAYS critical — never medium or low.
7. Do not report style issues that are handled by ESLint/Prettier.
8. Do not report issues in node_modules or generated files.
9. If you find zero issues at a severity level, write "No issues found." under that heading.
10. Write the full report to: forge/improve-report.md
11. After writing the report, output ONLY the file path. Nothing else.
`;

const FIX_PREAMBLE = `SYSTEM INSTRUCTIONS — READ BEFORE DOING ANYTHING:

You are a senior architect and principal engineer. You have been given a code improvement
report. Your job is to fix ALL items marked CRITICAL and HIGH. Not some. ALL of them.

PRIORITY ORDER:
- Fix FUNCTIONAL issues first (blank pages, broken routes, data not rendering, silent
  API failures, broken forms). These are the most important because they mean the app
  doesn't work at all.
- Fix INTEGRATION issues second (mismatched field names, wrong response shapes, missing
  middleware, missing env vars).
- Fix SECURITY issues third.
- Fix remaining HIGH issues last.

RULES:
1. IMPLEMENT every fix completely. No stubs, no TODOs, no "implement later".
2. Do not ask questions. Do not pause for confirmation.
3. Do not break existing tests. If a fix changes behavior, update the relevant tests.
4. After fixing each item, verify the fix is correct by reading the modified file.
5. If fixing one issue introduces another, fix that too.
6. Do not skip any CRITICAL or HIGH item. Every single one must be resolved.
7. When done, run the project tests (npm test -- --forceExit) to verify nothing is broken.
8. If any tests fail after your fixes, fix those too before finishing.
9. When fixing frontend issues, actually verify the component renders data — don't just
   fix the API call and assume the component handles the response correctly.
10. At the end, output a summary of what you fixed.

THE REPORT TO FIX:
---
`;

const TEST_FIX_PREAMBLE = `SYSTEM INSTRUCTIONS — READ BEFORE DOING ANYTHING:

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

const IMPROVE_TIMESTAMP_FILE = '.forge-improve-timestamp';

async function getLastImproveDate(projectDir) {
  try {
    const tsFile = path.join(projectDir, IMPROVE_TIMESTAMP_FILE);
    const content = await fs.readFile(tsFile, 'utf-8');
    return new Date(content.trim());
  } catch {
    return null;
  }
}

async function writeImproveTimestamp(projectDir) {
  const tsFile = path.join(projectDir, IMPROVE_TIMESTAMP_FILE);
  await fs.writeFile(tsFile, new Date().toISOString(), 'utf-8');
}

export async function checkImproveAge(projectDir) {
  const lastRun = await getLastImproveDate(projectDir);
  if (!lastRun) {
    console.log('  Notice: forge improve has never been run on this project.');
    console.log('  Run: forge improve');
    console.log('');
    return;
  }

  const daysSince = Math.floor((Date.now() - lastRun.getTime()) / (1000 * 60 * 60 * 24));
  if (daysSince > 30) {
    console.log(`  Notice: forge improve was last run ${daysSince} days ago.`);
    console.log('  Run: forge improve');
    console.log('');
  }
}

/**
 * Run tests and return { allPass, testOutput }.
 */
async function runTests(projectDir) {
  const streamLine = (line) => {
    console.log(`      ${line}`);
  };

  let testOutput = '';
  let allPass = true;

  console.log('    Running Jest...');
  const jestResult = await runCommand('npm', ['test', '--', '--forceExit'], {
    cwd: projectDir,
    timeout: 120000,
    onData: streamLine,
  });
  if (jestResult.status !== 0) {
    testOutput += 'JEST TEST FAILURES:\n' + (jestResult.stdout || '') + '\n' + (jestResult.stderr || '') + '\n\n';
    allPass = false;
  }

  const hasPlaywright = await fs.access(path.join(projectDir, 'playwright.config.js')).then(() => true).catch(() => false);
  if (hasPlaywright) {
    console.log('    Running Playwright...');
    const pwResult = await runCommand('npx', ['playwright', 'test'], {
      cwd: projectDir,
      timeout: 300000,
      onData: streamLine,
    });
    if (pwResult.status !== 0) {
      testOutput += 'PLAYWRIGHT E2E FAILURES:\n' + (pwResult.stdout || '') + '\n' + (pwResult.stderr || '') + '\n\n';
      allPass = false;
    }
  }

  return { allPass, testOutput };
}

/**
 * Verify fixes didn't break tests. If they did, auto-fix in a loop.
 */
async function verifyAndFix(projectDir, logDir, timestamp, options) {
  const maxFixLoops = 100;

  for (let loop = 1; loop <= maxFixLoops; loop++) {
    const sp = createSpinner(loop === 1 ? 'Verifying tests still pass' : `Fix loop ${loop}: Re-running tests`);
    const { allPass, testOutput } = await runTests(projectDir);

    if (allPass) {
      sp.succeed(loop === 1 ? 'All tests still pass' : `Fix loop ${loop}: All tests pass`);
      return;
    }

    sp.fail(loop === 1 ? 'Improve broke tests — auto-fixing' : `Fix loop ${loop}: Still failing`);

    const fixLogFile = path.join(logDir, `${timestamp}-improve-testfix-loop${loop}.log`);
    const fixSp = createSpinner(`Fix loop ${loop}: Fixing test failures`);
    const fixResult = await runClaude(TEST_FIX_PREAMBLE + testOutput, {
      cwd: projectDir,
      maxTurns: 200,
      timeout: 30,
      logFile: fixLogFile,
      spinner: fixSp,
      verbose: options.verbose || false,
    });

    if (fixResult.status !== 0) {
      fixSp.fail(`Fix loop ${loop}: Fix attempt had errors (log: ${path.relative(projectDir, fixLogFile)})`);
    } else {
      fixSp.succeed(`Fix loop ${loop}: Fix attempt completed (log: ${path.relative(projectDir, fixLogFile)})`);
    }
  }

  console.log(`  Tests still failing after ${maxFixLoops} fix loops.`);
  console.log('  Run: forge fix');
}

async function handleImprove(options) {
  const projectDir = process.cwd();
  const logDir = path.join(projectDir, 'forge', 'logs');
  await fs.mkdir(logDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  // If --file is given, read that report and fix from it
  if (options.file) {
    const reportPath = path.resolve(options.file);
    let reportContent;
    try {
      reportContent = await fs.readFile(reportPath, 'utf-8');
    } catch (err) {
      console.error(`  Error: Cannot read report file: ${reportPath}`);
      console.error(`  ${err.message}`);
      process.exit(1);
    }

    console.log('');
    console.log('  Fixing issues from report...');
    console.log(`  Report: ${reportPath}`);
    console.log('');

    const logFile = path.join(logDir, `${timestamp}-improve-fix.log`);
    const sp = createSpinner('Fixing issues');
    const result = await runClaude(FIX_PREAMBLE + reportContent, {
      cwd: projectDir,
      maxTurns: 200,
      timeout: 30,
      logFile,
      spinner: sp,
      verbose: options.verbose || false,
    });

    if (result.status !== 0) {
      sp.fail(`Fix pass completed with errors (log: ${path.relative(projectDir, logFile)})`);
    } else {
      sp.succeed(`Fix pass completed (log: ${path.relative(projectDir, logFile)})`);
    }

    // Verify fixes didn't break tests
    await verifyAndFix(projectDir, logDir, timestamp, options);

    await writeImproveTimestamp(projectDir);
    console.log('');
    return;
  }

  // Full scan + fix flow
  console.log('');
  console.log('  Running code improvement scan...');
  console.log('  This scans the entire codebase for security vulnerabilities,');
  console.log('  accessibility issues, bugs, and improvement opportunities.');
  console.log('');

  // Step 1: Scan and produce report
  const scanLogFile = path.join(logDir, `${timestamp}-improve-scan.log`);
  const scanSp = createSpinner('[1/2] Scanning codebase');
  const scanResult = await runClaude(SCAN_PREAMBLE, {
    cwd: projectDir,
    maxTurns: 200,
    timeout: 30,
    logFile: scanLogFile,
    spinner: scanSp,
    verbose: options.verbose || false,
  });

  if (scanResult.status !== 0) {
    scanSp.fail(`Scan failed (log: ${path.relative(projectDir, scanLogFile)})`);
    process.exit(1);
  }
  scanSp.succeed('Scan complete');

  // Check report was created
  const reportPath = path.join(projectDir, 'forge', 'improve-report.md');
  try {
    await fs.access(reportPath);
  } catch {
    console.error('  Scan completed but no report was generated at forge/improve-report.md');
    console.error(`  Check the scan log: ${path.relative(projectDir, scanLogFile)}`);
    process.exit(1);
  }

  const reportContent = await fs.readFile(reportPath, 'utf-8');
  console.log(`  Report written to: forge/improve-report.md`);

  // Count issues by severity
  const criticalCount = (reportContent.match(/^### C-\d+/gm) || []).length;
  const highCount = (reportContent.match(/^### H-\d+/gm) || []).length;
  const mediumCount = (reportContent.match(/^### M-\d+/gm) || []).length;
  const lowCount = (reportContent.match(/^### L-\d+/gm) || []).length;
  const recCount = (reportContent.match(/^### R-\d+/gm) || []).length;

  console.log('');
  console.log(`  Found: ${criticalCount} critical, ${highCount} high, ${mediumCount} medium, ${lowCount} low, ${recCount} recommendations`);

  // Step 2: Fix CRITICAL and HIGH
  if (criticalCount + highCount === 0) {
    console.log('  No critical or high issues to fix.');
    await writeImproveTimestamp(projectDir);
    console.log('');
    return;
  }

  if (options.scanOnly) {
    console.log('');
    console.log('  Scan-only mode. Skipping fixes.');
    console.log('  To fix: forge improve --file forge/improve-report.md');
    await writeImproveTimestamp(projectDir);
    console.log('');
    return;
  }

  console.log('');
  console.log(`  [2/2] Fixing ${criticalCount + highCount} critical/high issues...`);

  const fixLogFile = path.join(logDir, `${timestamp}-improve-fix.log`);
  const fixSp = createSpinner('Fixing critical/high issues');
  const fixResult = await runClaude(FIX_PREAMBLE + reportContent, {
    cwd: projectDir,
    maxTurns: 200,
    timeout: 30,
    logFile: fixLogFile,
    spinner: fixSp,
    verbose: options.verbose || false,
  });

  if (fixResult.status !== 0) {
    fixSp.fail(`Fix pass completed with errors (log: ${path.relative(projectDir, fixLogFile)})`);
  } else {
    fixSp.succeed('Fix pass completed');
  }

  // Step 3: Verify fixes didn't break tests, auto-fix if they did
  await verifyAndFix(projectDir, logDir, timestamp, options);

  await writeImproveTimestamp(projectDir);

  console.log('');
  console.log('  Summary:');
  console.log(`    Report:     forge/improve-report.md`);
  console.log(`    Scan log:   ${path.relative(projectDir, scanLogFile)}`);
  console.log(`    Fix log:    ${path.relative(projectDir, fixLogFile)}`);
  console.log('');
  console.log('  Medium and low issues are documented in the report.');
  console.log('  Fix them manually or run: forge improve --file forge/improve-report.md');
  console.log('');
}

export function registerImproveCommand(program) {
  program
    .command('improve')
    .description('Scan codebase for vulnerabilities, bugs, and improvements; fix critical/high issues')
    .option('--file <path>', 'Fix issues from an existing report file')
    .option('--scan-only', 'Generate report without fixing anything')
    .option('--verbose', 'Show real-time Claude activity in console')
    .action(handleImprove);
}
