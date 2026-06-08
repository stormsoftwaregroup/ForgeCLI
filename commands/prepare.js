import fs from 'fs/promises';
import path from 'path';
import { createSpinner } from '../lib/spinner.js';
import { runClaude } from '../lib/claude.js';
import { CAPABILITIES, TEMPLATE_REQUIREMENTS } from '../lib/capabilities.js';
import { reviewPromptContent } from '../lib/review.js';

/**
 * Build the template context block that tells Claude what the RI provides.
 */
function buildTemplateContext() {
  const caps = CAPABILITIES.map((c) =>
    `- ${c.name}: ${c.tech} (${c.files.join(', ')})`
  ).join('\n');

  const reqs = TEMPLATE_REQUIREMENTS.map((r) =>
    `### ${r.label}\n${r.text}`
  ).join('\n\n');

  return `
TEMPLATE CAPABILITIES (already built into the project):
${caps}

TEMPLATE CONVENTIONS:
${reqs}
`;
}

const PREPARE_PREAMBLE = `SYSTEM INSTRUCTIONS — READ BEFORE DOING ANYTHING:

You are a build prompt architect for a Forge project. Your job is to
take an input document (requirements doc, FRD, feature spec, rough notes, etc.) and
produce a set of ordered, self-contained build prompts that can be executed sequentially
by an AI coding agent.

${buildTemplateContext()}

RULES FOR GENERATING PROMPTS:
1. Read the ENTIRE input document carefully. Identify every feature, requirement, entity,
   page, endpoint, workflow, and integration described.
2. Break the work into logical, ordered prompts. Each prompt should be a self-contained
   unit of work that builds on the previous ones. Typical ordering:
   - Database schema / Prisma models first
   - Server-side services and API endpoints next
   - Validation schemas (Zod) for new endpoints
   - Client-side pages, components, and stores
   - Integration / wiring (routing, navigation, auth guards)
   - Seed data
   - Tests (Jest for API, Playwright for E2E)
3. Each prompt MUST be detailed enough that an AI agent can implement it without
   asking questions. Include:
   - Exact file paths to create or modify
   - Model/schema definitions with all fields and types
   - API endpoint signatures (method, path, request/response shape)
   - Component descriptions with props and behavior
   - Business logic rules and edge cases
   - Validation rules
4. Do NOT include work that the template already provides (see capabilities above).
   Reference existing template files instead of recreating them.
5. Each prompt MUST end with a VERIFY section that tells the agent how to confirm
   the work is done:
   \`\`\`
   VERIFY:
   - Run \`npm test\` and ensure all tests pass
   - Run \`npx prisma migrate dev\` if schema changed
   - List the files you created/modified
   \`\`\`
6. If the input document contains information that isn't a feature requirement
   (project context, team notes, design rationale, timeline), extract anything
   useful as context headers in the relevant prompts, but do not create prompts
   for non-implementable content.
7. If you identify gaps in the input document (e.g., it mentions "user dashboard"
   but doesn't specify what's on it, or mentions "notifications" with no detail),
   create a prompt anyway with reasonable defaults and flag it with a
   \`<!-- GAP: description of what was assumed -->\` comment.
8. Number prompts sequentially: 01, 02, 03, etc.
9. Use this exact file naming convention: \`<NN>-<slug>.md\`
   Example: \`01-database-schema.md\`, \`02-api-endpoints.md\`, \`03-frontend-pages.md\`

OUTPUT FORMAT:
Write each prompt as a separate file in the forge/prompts/ directory.
Each file should be a standalone markdown document.

After writing all prompt files, output a summary listing:
- Number of prompts created
- The file name and one-line description of each
- Any gaps or assumptions flagged
- Any conflicts with template capabilities detected

INPUT DOCUMENT:
---
`;

async function handlePrepare(file, options) {
  const projectDir = process.cwd();
  const promptDir = path.resolve(options.output || path.join(projectDir, 'forge', 'prompts'));

  // Resolve input file
  const inputPath = path.resolve(file);
  let inputContent;
  try {
    inputContent = await fs.readFile(inputPath, 'utf-8');
  } catch (err) {
    console.error(`  Error: Cannot read input file: ${inputPath}`);
    console.error(`  ${err.message}`);
    process.exit(1);
  }

  console.log('');
  console.log('  Preparing build prompts...');
  console.log(`  Input:   ${path.relative(projectDir, inputPath)}`);
  console.log(`  Output:  ${path.relative(projectDir, promptDir)}`);
  console.log('');

  // Ensure prompts directory exists
  await fs.mkdir(promptDir, { recursive: true });

  // Log setup
  const logDir = path.join(projectDir, 'forge', 'logs');
  await fs.mkdir(logDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const logFile = path.join(logDir, `${timestamp}-prepare.log`);

  // Send to Claude
  const prompt = PREPARE_PREAMBLE + inputContent;
  const sp = createSpinner('Analyzing document and generating prompts');

  const result = await runClaude(prompt, {
    cwd: projectDir,
    maxTurns: parseInt(options.maxTurns, 10) || 200,
    timeout: parseInt(options.timeout, 10) || 30,
    logFile,
    spinner: sp,
    verbose: options.verbose || false,
  });

  if (result.status !== 0) {
    sp.fail(`Prepare failed (log: ${path.relative(projectDir, logFile)})`);
    console.log('');
    process.exit(1);
  }

  sp.succeed('Prompts generated');

  // List what was created
  let promptFiles;
  try {
    promptFiles = (await fs.readdir(promptDir))
      .filter((f) => f.endsWith('.md') && !f.endsWith('.reviewed.md'))
      .sort();
  } catch {
    promptFiles = [];
  }

  if (promptFiles.length === 0) {
    console.log('');
    console.log('  Warning: No prompt files found in output directory.');
    console.log(`  Check the log: ${path.relative(projectDir, logFile)}`);
    console.log('');
    return;
  }

  // Review each prompt for template conflicts
  console.log('');
  console.log(`  Generated ${promptFiles.length} prompt(s):`);

  let totalConflicts = 0;
  let totalGaps = 0;

  for (const pf of promptFiles) {
    const content = await fs.readFile(path.join(promptDir, pf), 'utf-8');
    const { conflicts } = reviewPromptContent(content);
    const gapCount = (content.match(/<!-- GAP:/g) || []).length;

    let status = '';
    if (conflicts.length > 0) {
      totalConflicts += conflicts.length;
      const conflictNames = conflicts.map((c) => c.capability.name).join(', ');
      status += ` [conflicts: ${conflictNames}]`;
    }
    if (gapCount > 0) {
      totalGaps += gapCount;
      status += ` [${gapCount} gap(s)]`;
    }

    console.log(`    ${pf}${status}`);
  }

  console.log('');

  if (totalConflicts > 0) {
    console.log(`  ${totalConflicts} template conflict(s) detected — forge build will auto-apply RI overrides.`);
  }
  if (totalGaps > 0) {
    console.log(`  ${totalGaps} gap(s) flagged — review prompts with <!-- GAP: --> comments before building.`);
  }

  console.log(`  Log: ${path.relative(projectDir, logFile)}`);
  console.log('');
  console.log('  Next steps:');
  console.log('    1. Review the prompts in forge/prompts/');
  console.log('    2. Edit any flagged gaps or conflicts');
  console.log('    3. Run: forge build');
  console.log('');
}

export function registerPrepareCommand(program) {
  program
    .command('prepare <file>')
    .description('Analyze a document and generate build prompts from it')
    .option('-o, --output <dir>', 'Output directory for prompts (default: forge/prompts)')
    .option('--max-turns <N>', 'Max Claude turns (default: 200)', '200')
    .option('--timeout <minutes>', 'Max minutes (default: 30)', '30')
    .option('--verbose', 'Show real-time Claude activity in console')
    .action(handlePrepare);
}
