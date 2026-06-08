import path from 'path';

/**
 * Convert project name to snake_case (for DB names).
 * "My-Cool-App" -> "my_cool_app"
 */
export function toSnakeCase(name) {
  return name.toLowerCase().replace(/-/g, '_');
}

/**
 * Convert project name to Title Case (for display).
 * "My-Cool-App" -> "My Cool App"
 * "my-cool-app" -> "My Cool App"
 */
export function toTitleCase(name) {
  return name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Lowercase version of the project name (for npm, URLs, etc.).
 * "My-Cool-App" -> "my-cool-app"
 */
export function toLowerName(name) {
  return name.toLowerCase();
}

const TEXT_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.json', '.md',
  '.yml', '.yaml', '.sql', '.html', '.css',
  '.bat', '.sh', '.toml', '.prisma', '.xml',
]);

const TEXT_FILENAMES = new Set([
  '.prettierrc', '.editorconfig', '.eslintignore', '.eslintrc.json',
  '.gitignore', '.gitkeep', '.env', '.env.example', '.env.test',
  'Dockerfile', 'Makefile', 'LICENSE', 'web.config',
]);

/**
 * Check if a file should be treated as text (eligible for content replacement).
 */
export function isTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath);

  if (TEXT_FILENAMES.has(basename)) return true;
  if (TEXT_EXTENSIONS.has(ext)) return true;
  if (basename.startsWith('.') && !ext) return true;

  return false;
}

/**
 * Validate a project name. Allows mixed case — the directory and repo
 * keep the user's casing. Lowercase is derived internally where needed
 * (npm package name, database name, etc.).
 */
export function validateProjectName(name) {
  if (!name || name.length === 0) {
    return 'Project name is required.';
  }
  if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(name)) {
    return 'Project name must start with a letter and contain only letters, digits, and hyphens.';
  }
  if (name.length > 100) {
    return 'Project name must be 100 characters or fewer.';
  }
  return null;
}
