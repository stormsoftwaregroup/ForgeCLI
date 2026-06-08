import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';
import { CAPABILITIES, TEMPLATE_REQUIREMENTS } from './capabilities.js';

/**
 * Detect conflicts between a prompt's content and the template's capabilities.
 * Returns an array of { capability, matchedTerms } objects.
 */
export function detectConflicts(promptContent) {
  const lower = promptContent.toLowerCase();
  const conflicts = [];

  for (const cap of CAPABILITIES) {
    const matchedTerms = [];
    for (const pattern of cap.conflicts) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(promptContent)) {
        // Extract the matched text for display
        const match = promptContent.match(regex);
        if (match) matchedTerms.push(match[0]);
      }
    }
    if (matchedTerms.length > 0) {
      conflicts.push({
        capability: cap,
        matchedTerms: [...new Set(matchedTerms)],
      });
    }
  }

  return conflicts;
}

/**
 * Run the interactive prompt review stage.
 * Returns the list of prompt files to execute (possibly rewritten).
 */
export async function reviewPrompts(promptFiles, promptDir, projectDir) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (question) =>
    new Promise((resolve) => rl.question(question, resolve));

  const results = [];

  for (const file of promptFiles) {
    const filePath = path.join(promptDir, file);
    const content = await fs.readFile(filePath, 'utf-8');
    const conflicts = detectConflicts(content);

    if (conflicts.length === 0) {
      results.push({ file, path: filePath, reviewed: false });
      continue;
    }

    console.log('');
    console.log(`  Prompt "${file}" conflicts with template capabilities:`);
    console.log('');

    conflicts.forEach((c, i) => {
      console.log(`   ${i + 1}. ${c.capability.name}`);
      console.log(`      Prompt mentions: ${c.matchedTerms.map((t) => `"${t}"`).join(', ')}`);
      console.log(`      Template provides: ${c.capability.tech} (${c.capability.files.join(', ')})`);
      console.log('');
    });

    console.log('   For each conflict, choose:');
    console.log('     [R] Use Reference Implementation (rewrite prompt)');
    console.log('     [P] Use Prompt\'s approach (keep as-is)');
    console.log('     [S] Skip this prompt entirely');
    console.log('');

    const decisions = [];
    let skipPrompt = false;

    for (let i = 0; i < conflicts.length; i++) {
      const c = conflicts[i];
      let answer = '';
      while (!['r', 'p', 's'].includes(answer)) {
        answer = (await ask(`   Conflict ${i + 1} - ${c.capability.name}: [R/P/S] `)).trim().toLowerCase();
      }

      if (answer === 's') {
        skipPrompt = true;
        decisions.push({ conflict: c, decision: 'SKIP' });
        break;
      }

      decisions.push({
        conflict: c,
        decision: answer === 'r' ? 'USE_RI' : 'USE_PROMPT',
      });
    }

    if (skipPrompt) {
      console.log(`   Skipping: ${file}`);
      continue;
    }

    // Write decision record
    const decisionsDir = path.join(projectDir, 'forge', 'decisions');
    await fs.mkdir(decisionsDir, { recursive: true });
    const decisionContent = generateDecisionRecord(file, decisions);
    const decisionFile = path.join(decisionsDir, `${path.basename(file, '.md')}-decisions.md`);
    await fs.writeFile(decisionFile, decisionContent, 'utf-8');
    console.log(`   Decision record: ${path.relative(projectDir, decisionFile)}`);

    // If any decisions chose RI, rewrite the prompt
    const riDecisions = decisions.filter((d) => d.decision === 'USE_RI');
    if (riDecisions.length > 0) {
      const rewritten = rewritePrompt(content, riDecisions);
      const reviewedPath = path.join(promptDir, `${path.basename(file, '.md')}.reviewed.md`);
      await fs.writeFile(reviewedPath, rewritten, 'utf-8');
      console.log(`   Rewritten prompt: ${path.basename(reviewedPath)}`);
      results.push({ file, path: reviewedPath, reviewed: true });
    } else {
      results.push({ file, path: filePath, reviewed: false });
    }
  }

  rl.close();
  return results;
}

/**
 * Generate a decision record markdown file.
 */
function generateDecisionRecord(promptFile, decisions) {
  const date = new Date().toISOString().split('T')[0];
  let md = `# Prompt Review Decisions: ${path.basename(promptFile, '.md')}\n\n`;
  md += `Date: ${date}\n`;
  md += `Reviewer: user (interactive)\n\n`;

  decisions.forEach((d, i) => {
    const cap = d.conflict.capability;
    const label =
      d.decision === 'USE_RI'
        ? 'USE REFERENCE IMPLEMENTATION'
        : d.decision === 'USE_PROMPT'
          ? 'USE PROMPT'
          : 'SKIP';

    md += `## Conflict ${i + 1}: ${cap.name}\n`;
    md += `- **Prompt mentions:** ${d.conflict.matchedTerms.join(', ')}\n`;
    md += `- **Template provides:** ${cap.tech} (${cap.files.join(', ')})\n`;
    md += `- **Decision:** ${label}\n\n`;
  });

  return md;
}

/**
 * Detect which template requirements are relevant to a prompt based on keywords.
 * Returns the subset of TEMPLATE_REQUIREMENTS that should be injected.
 */
function detectRelevantRequirements(promptContent) {
  const lower = promptContent.toLowerCase();
  const relevant = [];

  // Always include logging and error handling — every feature needs them
  relevant.push('logging', 'error-handling');

  // Auth if the prompt mentions protected routes, roles, users, auth
  if (/\b(auth|protected|role|permission|login|user management|admin)\b/i.test(promptContent)) {
    relevant.push('auth');
  }

  // Database if it mentions models, tables, entities, CRUD, schema, migration
  if (/\b(model|table|entity|schema|migration|database|crud|prisma|data\s*model)\b/i.test(promptContent)) {
    relevant.push('database');
  }

  // Testing if it mentions test, spec, or verification
  if (/\b(test|spec|verify|e2e|playwright|jest)\b/i.test(promptContent)) {
    relevant.push('testing');
  }

  // Frontend if it mentions component, page, UI, form, React, client, frontend
  if (/\b(component|page|ui|form|react|client|frontend|button|modal|dashboard|chart|graph)\b/i.test(promptContent)) {
    relevant.push('frontend');
  }

  // Validation if it mentions validation, input, form, schema
  if (/\b(validat|input.*sanitiz|form.*submit|request.*body|zod|schema.*valid)\b/i.test(promptContent)) {
    relevant.push('validation');
  }

  // API docs if it mentions routes, endpoints, API
  if (/\b(route|endpoint|api|rest|swagger)\b/i.test(promptContent)) {
    relevant.push('api-docs');
  }

  return TEMPLATE_REQUIREMENTS.filter((r) => relevant.includes(r.key));
}

/**
 * Build the requirements block to append to a prompt.
 */
function buildRequirementsBlock(requirements) {
  if (requirements.length === 0) return '';

  const sections = requirements.map((r) => `### ${r.label}\n${r.text}`);

  return [
    '',
    '',
    'TEMPLATE REQUIREMENTS — Follow these conventions for this step:',
    '================================================================',
    '',
    ...sections,
    '',
  ].join('\n');
}

/**
 * Review a single prompt's content against template capabilities.
 * Used by both file-based and multi-prompt review flows.
 * Returns { conflicts, relevantRequirements }.
 */
export function reviewPromptContent(promptContent) {
  const conflicts = detectConflicts(promptContent);
  const relevantRequirements = detectRelevantRequirements(promptContent);
  return { conflicts, relevantRequirements };
}

/**
 * Enrich a prompt with template requirements. Returns the enriched content.
 */
export function enrichPrompt(promptContent) {
  const { relevantRequirements } = reviewPromptContent(promptContent);
  return promptContent + buildRequirementsBlock(relevantRequirements);
}

/**
 * Rewrite a prompt to enforce RI conventions for chosen conflicts.
 */
function rewritePrompt(originalContent, riDecisions) {
  let content = originalContent;

  // Build convention instructions
  const conventions = riDecisions.map((d) => {
    const cap = d.conflict.capability;
    const doNotUse = d.conflict.matchedTerms.join(', ');
    return `- Use ${cap.tech} for ${cap.name.toLowerCase()} (see ${cap.files.join(', ')} for pattern)\n  Do NOT install or use: ${doNotUse}`;
  });

  const conventionBlock = [
    '',
    'IMPORTANT — TEMPLATE CONVENTIONS (do not override):',
    ...conventions,
    '',
  ].join('\n');

  // Comment out lines that mention conflicting terms
  for (const d of riDecisions) {
    for (const term of d.conflict.matchedTerms) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`^(.*${escaped}.*)$`, 'gim');
      content = content.replace(regex, '<!-- OVERRIDDEN: $1 -->');
    }
  }

  // Append convention block
  content += conventionBlock;

  return content;
}
