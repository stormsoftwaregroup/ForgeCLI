import fs from 'fs/promises';
import path from 'path';
import { toSnakeCase, toTitleCase, toLowerName, isTextFile } from './utils.js';

/**
 * Build the ordered replacement pairs for a given project name.
 * Order matters: longest/most-specific patterns first to avoid partial matches.
 *
 * The user's original casing is preserved for display (Title Case) and the
 * directory/repo name. Lowercase is used only where required: npm package
 * names, database names, email domains, CSS class prefixes, etc.
 */
export function buildReplacements(projectName) {
  const lowerName = toLowerName(projectName);
  const snakeName = toSnakeCase(projectName);
  const titleName = toTitleCase(projectName);

  return [
    ['forge-template', lowerName],               // npm package name (must be lowercase)
    ['Forge Template', titleName],               // display name (user's casing → Title Case)
    ['forge_template_test', `${snakeName}_test`],// test DB name (lowercase)
    ['forge_template', snakeName],               // DB name (lowercase)
    ['forge-app', lowerName],                    // internal references (lowercase)
    ['@forge.local', `@${lowerName}.local`],     // email domain (lowercase)
  ];
}

/**
 * Apply all replacements to a string.
 */
export function applyReplacements(content, replacements) {
  let result = content;
  for (const [find, replace] of replacements) {
    result = result.split(find).join(replace);
  }
  return result;
}

/**
 * Recursively walk a directory and apply replacements to all text files.
 */
export async function renameProjectFiles(targetDir, projectName) {
  const replacements = buildReplacements(projectName);
  await walkAndReplace(targetDir, replacements);
}

async function walkAndReplace(dir, replacements) {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      await walkAndReplace(fullPath, replacements);
    } else if (entry.isFile() && isTextFile(fullPath)) {
      const content = await fs.readFile(fullPath, 'utf-8');
      const updated = applyReplacements(content, replacements);
      if (updated !== content) {
        await fs.writeFile(fullPath, updated, 'utf-8');
      }
    }
  }
}
