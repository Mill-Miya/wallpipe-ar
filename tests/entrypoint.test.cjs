'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');

const home = fs.readFileSync('index.html', 'utf8');
assert.equal(home, fs.readFileSync('ar-hand.html', 'utf8'), 'Both URLs must serve the same AR shell');
assert.match(home, /<canvas id="arCanvas"/);
assert.equal((home.match(/ARカメラを開始/g) || []).length, 1, 'Render only one camera action');
assert.match(home, /id="quickAction"[^>]*disabled/, 'Camera must wait for engine and explicit action');
assert.match(home, /aria-expanded="false" aria-controls="panel"/);
assert.match(home, /id="panel"[^>]*hidden/);
assert.match(home, /href="https:\/\/mill-miya\.github\.io\/" target="_blank" rel="noopener noreferrer"/);
assert.match(home, /assets\/brand\/r-logo-black\.svg/);
assert.match(home, /\.\/pipe-preview\.html/);
assert.doesNotMatch(home, /http-equiv="refresh"|getUserMedia\(|KITZ|キッツ/);
console.log('PASS: Direct AR at both URLs, single explicit camera action, settings disclosure, brand and preview');
