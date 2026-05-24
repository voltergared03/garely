// Merge per-namespace translation files (written by sub-agents) into the
// central catalogs. Each input file is named `<ns>.<lang>.json` and contains
// either { "<ns>": {…} } or just {…}.
const fs = require('fs');
const path = require('path');

const dir = process.argv[2] || '/tmp/i18n';
for (const lang of ['en', 'uk']) {
  const catPath = `src/messages/${lang}.json`;
  const cat = JSON.parse(fs.readFileSync(catPath, 'utf8'));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(`.${lang}.json`));
  for (const f of files) {
    const obj = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    // Each file's top-level keys ARE the namespaces it contributes (a file may
    // contribute several, and several files may add to the same namespace).
    for (const ns of Object.keys(obj)) {
      const payload = obj[ns];
      cat[ns] = { ...(cat[ns] || {}), ...payload };
      console.log(`  ${lang}: ${f} → "${ns}" (+${Object.keys(payload).length} keys)`);
    }
  }
  fs.writeFileSync(catPath, JSON.stringify(cat, null, 2) + '\n');
}
console.log('done.');
