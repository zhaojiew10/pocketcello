import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { NOTES, STRINGS, getNote, parseNote, parseSequence } from '../notes.js';

test('音域包含 C2–A4 的 34 个半音', () => {
  assert.equal(NOTES.length, 34);
  assert.equal(NOTES[0].shortLabel, 'C2');
  assert.equal(NOTES.at(-1).shortLabel, 'A4');
  assert.equal(getNote(35), null);
  assert.equal(getNote(70), null);
});

test('所有音符都映射到仓库中的真实音频', () => {
  for (const note of NOTES) {
    assert.ok(existsSync(new URL(`../${note.audio}`, import.meta.url)), note.audio);
  }
});

test('四根琴弦各包含一个八度的 13 个音符', () => {
  assert.deepEqual(STRINGS.map((string) => string.startMidi), [57, 50, 43, 36]);
  for (const string of STRINGS) {
    const notes = Array.from({ length: 13 }, (_, index) => getNote(string.startMidi + index));
    assert.ok(notes.every(Boolean));
    assert.equal(notes[12].midi - notes[0].midi, 12);
  }
});

test('兼容标准升降号、前置升降号和原项目的斜线写法', () => {
  const equivalents = ['C#3', '#C3', 'Db3', 'bD3', 'C#3/Db3', '#C3/bD3', 'C♯3', 'D♭3'];
  for (const token of equivalents) {
    assert.equal(parseNote(token)?.midi, 49, token);
  }
  assert.equal(parseNote('#A3/bB3')?.shortLabel, 'A#3');
  assert.equal(parseNote('A3')?.label, 'A3');
});

test('异名同音必须匹配，非法音符和超出音域的音符会被拒绝', () => {
  assert.equal(parseNote('C#3/Eb3'), null);
  assert.equal(parseNote('H3'), null);
  assert.equal(parseNote('C1'), null);
  assert.equal(parseNote('C5'), null);
  assert.equal(parseNote(''), null);
});

test('旋律解析支持空白、逗号、中文标点和休止符', () => {
  const result = parseSequence('C3, D3，E3; F3；G3 - A3 _ B3 rest C4');
  assert.equal(result.errors.length, 0);
  assert.equal(result.entries.length, 11);
  assert.deepEqual(result.entries.filter((entry) => entry.type === 'rest').length, 3);
  assert.equal(result.entries.at(-1).note.shortLabel, 'C4');
});

test('旋律解析会报告无效 token，同时保留有效音符', () => {
  const result = parseSequence('C3 nope D3 C9');
  assert.equal(result.entries.length, 2);
  assert.deepEqual(result.errors.map((error) => error.token), ['nope', 'C9']);
});
