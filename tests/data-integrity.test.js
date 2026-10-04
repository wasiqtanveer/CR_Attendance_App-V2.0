import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fetchAllRows } from '../src/lib/fetchAllRows.js';
import { validateRoster } from '../src/lib/rosterImport.js';

function makeQueue(upsert, remove = async () => ({ error: null })) {
  const storage = new Map();
  const localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
    key: index => [...storage.keys()][index] ?? null,
    get length() { return storage.size; },
  };
  const source = fs.readFileSync(new URL('../src/lib/attendanceQueue.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  const context = vm.createContext({
    localStorage, navigator: { onLine: true },
    window: { dispatchEvent() {}, addEventListener() {} },
    CustomEvent: class { constructor(name, detail) { this.name = name; this.detail = detail; } },
    setTimeout: () => 1, clearTimeout() {},
    supabase: { from: () => ({ upsert, delete: () => ({
      eq() { return this; },
      in: (_, studentIds) => remove(studentIds),
    }) }) },
  });
  vm.runInContext(`${source}\nglobalThis.api = { queueMarks, flushMarks, pendingMarks, queueState, storage: localStorage };`, context);
  return context.api;
}

test('a mark added during an in-flight save is sent in a later batch', async () => {
  let finishFirst;
  const writes = [];
  const queue = makeQueue(async rows => {
    writes.push(rows.map(row => ({ ...row })));
    if (writes.length === 1) return new Promise(resolve => { finishFirst = resolve; });
    return { error: null };
  });
  queue.queueMarks('user', 'course', '2026-10-04', { studentA: 'present' });
  const first = queue.flushMarks('user', 'course', '2026-10-04');
  queue.queueMarks('user', 'course', '2026-10-04', { studentB: 'absent' });
  finishFirst({ error: null });
  await first;
  assert.equal(writes.length, 2);
  assert.equal(writes[1][0].student_id, 'studentB');
  assert.equal(queue.queueState('user', 'course', '2026-10-04').pending, 0);
});

test('pending marks survive a failed request and retain their original date', async () => {
  let fail = true;
  const writes = [];
  const queue = makeQueue(async rows => {
    writes.push(rows.map(row => ({ ...row })));
    return { error: fail ? new Error('Network failed') : null };
  });
  queue.queueMarks('user', 'course', '2026-10-03', { studentA: 'present' });
  await queue.flushMarks('user', 'course', '2026-10-03');
  assert.equal(queue.queueState('user', 'course', '2026-10-03').pending, 1);
  queue.queueMarks('user', 'course', '2026-10-04', { studentB: 'absent' });
  fail = false;
  await queue.flushMarks('user', 'course', '2026-10-03');
  await queue.flushMarks('user', 'course', '2026-10-04');
  assert.equal(writes.at(-2)[0].date, '2026-10-03');
  assert.equal(writes.at(-1)[0].date, '2026-10-04');
  assert.equal(queue.queueState('user', 'course', '2026-10-03').pending, 0);
});

test('undoing a bulk mark removes newly marked rows and updates the offline day cache', async () => {
  const removed = [];
  const queue = makeQueue(async () => ({ error: null }), async studentIds => {
    removed.push(...studentIds);
    return { error: null };
  });
  queue.queueMarks('user', 'course', '2026-10-04', { studentA: 'present' });
  await queue.flushMarks('user', 'course', '2026-10-04');
  assert.equal(JSON.parse(queue.storage.getItem('attendance_day_user_course_2026-10-04'))[0].status, 'present');
  queue.queueMarks('user', 'course', '2026-10-04', { studentA: null });
  assert.equal(JSON.parse(queue.storage.getItem('attendance_day_user_course_2026-10-04')).length, 0);
  await queue.flushMarks('user', 'course', '2026-10-04');
  assert.deepEqual(removed, ['studentA']);
  assert.equal(queue.queueState('user', 'course', '2026-10-04').pending, 0);
});

test('all pages are loaded for a report larger than one API response', async () => {
  const rows = Array.from({ length: 1203 }, (_, id) => ({ id }));
  const result = await fetchAllRows(() => ({ range: async (from, to) => ({ data: rows.slice(from, to + 1), error: null }) }));
  assert.equal(result.length, 1203);
  assert.equal(result.at(-1).id, 1202);
});

test('import distinguishes duplicates and invalid entries', () => {
  const result = validateRoster([
    { name: 'Ayesha', reg_number: ' cs-001 ' },
    { name: 'Ali', reg_number: 'CS-002' },
    { name: 'Zara', reg_number: 'cs-002' },
    { name: '', reg_number: 'CS-003' },
  ], [{ name: 'Existing', reg_number: 'CS-001' }]);
  assert.equal(result.valid.length, 1);
  assert.equal(result.duplicate.length, 2);
  assert.equal(result.invalid.length, 1);
  assert.equal(result.valid[0].reg_number, 'CS-002');
});

test('pasted rosters accept tabs, commas, reversed columns, numbering and headers', async () => {
  const { parseRosterText } = await import('../src/lib/rosterImport.js');
  const rows = parseRosterText([
    'Name\tReg Number',
    'Ahmed Khan\t2021-CS-101',
    'Sara Ali, 2021-CS-102',
    '2021-CS-103; Bilal Ahmed',
    '4. Zara Noor, 2021-CS-104',
    '5 Usman Tariq 2021-CS-105',
    'Hina Shah 2021-CS-106',
    '',
    'Only A Name',
  ].join('\n'));
  assert.deepEqual(rows.slice(0, 6), [
    { name: 'Ahmed Khan', reg_number: '2021-CS-101' },
    { name: 'Sara Ali', reg_number: '2021-CS-102' },
    { name: 'Bilal Ahmed', reg_number: '2021-CS-103' },
    { name: 'Zara Noor', reg_number: '2021-CS-104' },
    { name: 'Usman Tariq', reg_number: '2021-CS-105' },
    { name: 'Hina Shah', reg_number: '2021-CS-106' },
  ]);
  assert.equal(rows.length, 7);
  assert.equal(rows[6].reg_number, '');
});

test('spreadsheet rows skip headers and serial-number columns', async () => {
  const { parseRosterSheet } = await import('../src/lib/rosterImport.js');
  const rows = parseRosterSheet([
    ['Sr', 'Name', 'Reg No'],
    ['1', 'Ahmed Khan', '2021-CS-101'],
    ['2', 'Sara Ali', '2021-CS-102'],
    [],
  ]);
  assert.deepEqual(rows, [
    { name: 'Ahmed Khan', reg_number: '2021-CS-101' },
    { name: 'Sara Ali', reg_number: '2021-CS-102' },
  ]);
});
