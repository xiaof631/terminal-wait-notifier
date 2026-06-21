#!/usr/bin/env node

const seconds = Number(process.argv[2] || 2);
process.stdout.write(`Working for ${seconds}s...\n`);
setTimeout(() => {
  process.stdout.write('Finished.\n');
}, seconds * 1000);
