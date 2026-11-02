// Sets the version:  npm run bump -- 1.0.1
// Then commit and push to main; the Release workflow sees the new version and ships it.
const fs = require('fs');
const path = require('path');
const v = String(process.argv[2] || '').replace(/^v/, '');
if (!/^\d+\.\d+\.\d+$/.test(v)) { console.error('Usage: npm run bump -- 1.2.3'); process.exit(1); }
const file = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
pkg.version = v;
fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
console.log(`Version set to ${v}. Commit and push to main to release it.`);
