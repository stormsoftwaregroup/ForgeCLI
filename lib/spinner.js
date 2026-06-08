/**
 * Simple status logger that prints a new line only when the activity changes.
 * No animation — works reliably on all terminals including Windows.
 */
export function createSpinner(label) {
  const start = Date.now();
  let lastActivity = '';

  function elapsed() {
    return ((Date.now() - start) / 1000).toFixed(1);
  }

  // Print the initial label
  process.stdout.write(`  ⠿ ${label}\n`);

  return {
    succeed(msg) {
      process.stdout.write(`  ✔ ${msg || label} (${elapsed()}s)\n`);
    },
    fail(msg) {
      process.stdout.write(`  ✖ ${msg || label} (${elapsed()}s)\n`);
    },
    update(newLabel) {
      label = newLabel;
      process.stdout.write(`  ⠿ ${label}\n`);
    },
    activity(text) {
      if (text && text !== lastActivity) {
        lastActivity = text;
        process.stdout.write(`    → ${text}\n`);
      }
    },
  };
}
