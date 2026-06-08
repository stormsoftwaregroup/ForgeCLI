import fs from 'fs/promises';
import path from 'path';

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'playwright-report',
  'test-results',
  'dist',
]);

const SKIP_FILES = new Set([
  'package-lock.json',
]);

/**
 * Copy the template directory to a target, skipping excluded paths.
 */
export async function copyTemplate(templateDir, targetDir) {
  await fs.cp(templateDir, targetDir, {
    recursive: true,
    filter: (src) => {
      const basename = path.basename(src);
      if (SKIP_DIRS.has(basename) && src !== templateDir) return false;
      if (SKIP_FILES.has(basename)) return false;
      return true;
    },
  });
}
