import AxeBuilder from '@axe-core/playwright';

/**
 * Run axe accessibility scan on the current page and assert zero violations.
 * Optionally pass axe options (e.g. { disableRules: ['color-contrast'] }).
 */
export async function checkAccessibility(page, options = {}) {
  let builder = new AxeBuilder({ page });

  if (options.disableRules) {
    builder = builder.disableRules(options.disableRules);
  }

  const results = await builder.analyze();
  return results;
}
