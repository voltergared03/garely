const fs = require('fs');

function flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? prefix + '.' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, key));
    else out[key] = v;
  }
  return out;
}

const en = JSON.parse(fs.readFileSync('src/messages/en.json', 'utf8'));
const uk = JSON.parse(fs.readFileSync('src/messages/uk.json', 'utf8'));
const enKeys = new Set(Object.keys(flatten(en)));
const ukKeys = new Set(Object.keys(flatten(uk)));

console.log('JSON parsed OK. en keys:', enKeys.size, '| uk keys:', ukKeys.size);
const onlyEn = [...enKeys].filter((k) => !ukKeys.has(k));
const onlyUk = [...ukKeys].filter((k) => !enKeys.has(k));
if (onlyEn.length) console.log('⚠ present in en, missing in uk:', onlyEn);
if (onlyUk.length) console.log('⚠ present in uk, missing in en:', onlyUk);

const files = process.argv.slice(2);
const re = /\b(?:t|tr)\(\s*'([^']+)'/g;
const missing = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = re.exec(src))) {
    const key = m[1];
    if (!key.includes('.')) continue;
    if (!enKeys.has(key)) missing.push(`${f} -> ${key}`);
  }
}
if (missing.length) {
  console.log('❌ MISSING KEYS (referenced in code, absent from en.json):');
  console.log(missing.join('\n'));
  process.exit(1);
}
console.log('✓ All dotted keys referenced in scanned files exist in en.json');
