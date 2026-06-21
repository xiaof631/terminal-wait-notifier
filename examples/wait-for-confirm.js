#!/usr/bin/env node

process.stdout.write('Deploy to production? [y/N] ');
process.stdin.setEncoding('utf8');
process.stdin.once('data', (input) => {
  const answer = input.trim().toLowerCase();
  if (answer === 'y' || answer === 'yes') {
    process.stdout.write('Deploying...\n');
    setTimeout(() => {
      process.stdout.write('Done.\n');
      process.exit(0);
    }, 800);
    return;
  }
  process.stderr.write('Cancelled.\n');
  process.exit(1);
});
