import { AudioEngine } from './audio.js';
import { STRINGS, getNote, parseSequence } from './notes.js';

const EXAMPLES = {
  scale: 'C3 D3 E3 F3 G3 A3 B3 C4 C4 B3 A3 G3 F3 E3 D3 C3',
  twinkle: 'C3 C3 G3 G3 A3 A3 G3 - F3 F3 E3 E3 D3 D3 C3',
  ode: 'E3 E3 F3 G3 G3 F3 E3 D3 C3 C3 D3 E3 E3 D3 D3',
};

const engine = new AudioEngine();
const fingerboard = document.querySelector('#fingerboard');
const form = document.querySelector('#sequence-form');
const noteInput = document.querySelector('#note-input');
const inputError = document.querySelector('#input-error');
const playButton = document.querySelector('#play-button');
const playLabel = document.querySelector('#play-label');
const stopButton = document.querySelector('#stop-button');
const tempoInput = document.querySelector('#tempo');
const tempoValue = document.querySelector('#tempo-value');
const volumeInput = document.querySelector('#volume');
const volumeValue = document.querySelector('#volume-value');
const loopInput = document.querySelector('#loop');
const preview = document.querySelector('#sequence-preview');
const progressText = document.querySelector('#progress-text');
const progressTrack = document.querySelector('#progress-track');
const progressFill = document.querySelector('#progress-fill');
const playbackStatus = document.querySelector('#playback-status');

const noteButtons = new Map();
let sequenceEntries = [];
let sequenceTimer = null;
let manualTimer = null;
let sessionId = 0;
let isPlaying = false;

function buildFingerboard() {
  const fretRow = document.createElement('div');
  fretRow.className = 'fret-row';
  fretRow.append(createElement('span', 'fret-number', '品位'));

  for (let fret = 0; fret <= 12; fret += 1) {
    const marker = [0, 3, 5, 7, 9, 12].includes(fret) ? ' marker' : '';
    fretRow.append(createElement('span', `fret-number${marker}`, String(fret)));
  }
  fingerboard.append(fretRow);

  for (const string of STRINGS) {
    const row = document.createElement('div');
    row.className = 'string-row';
    row.style.setProperty('--string-rgb', string.rgb);

    const label = document.createElement('div');
    label.className = 'string-label';
    const stringName = createElement('strong', '', string.id);
    const stringRange = createElement('span', '', string.description);
    label.append(stringName, stringRange);
    row.append(label);

    for (let semitone = 0; semitone <= 12; semitone += 1) {
      const note = getNote(string.startMidi + semitone);
      const cell = document.createElement('div');
      cell.className = 'note-cell';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = `note-button${note.isAccidental ? ' accidental' : ''}`;
      button.dataset.midi = String(note.midi);
      button.title = `${note.label} · 点击播放`;
      button.setAttribute(
        'aria-label',
        `${string.name}，${semitone === 0 ? '空弦' : `第 ${semitone} 品`}，${note.label}`,
      );

      if (note.isAccidental) {
        button.append(
          createElement('span', '', note.displaySharp),
          createElement('span', '', note.displayFlat),
        );
      } else {
        button.textContent = note.displaySharp;
      }

      button.addEventListener('click', () => playManualNote(note));
      button.addEventListener('pointerenter', () => highlightRelatedNotes(note.midi));
      button.addEventListener('pointerleave', () => highlightRelatedNotes(null));
      button.addEventListener('focus', () => highlightRelatedNotes(note.midi));
      button.addEventListener('blur', () => highlightRelatedNotes(null));

      if (!noteButtons.has(note.midi)) noteButtons.set(note.midi, []);
      noteButtons.get(note.midi).push(button);
      cell.append(button);
      row.append(cell);
    }

    fingerboard.append(row);
  }
}

function createElement(tag, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function highlightRelatedNotes(midi) {
  for (const [noteMidi, buttons] of noteButtons) {
    for (const button of buttons) {
      button.classList.toggle('is-related', midi !== null && noteMidi === midi);
    }
  }
}

function highlightPlayingNote(midi) {
  for (const [noteMidi, buttons] of noteButtons) {
    for (const button of buttons) {
      button.classList.toggle('is-playing', noteMidi === midi);
    }
  }
}

function setStatus(message, isError = false) {
  playbackStatus.textContent = message;
  playbackStatus.classList.toggle('error', isError);
}

function setTransportPlaying(playing) {
  isPlaying = playing;
  stopButton.disabled = !playing;
  playLabel.textContent = playing ? '重新播放' : '播放旋律';
  playButton.setAttribute('aria-label', playing ? '从头重新播放旋律' : '播放旋律');
}

function resetProgress() {
  progressText.textContent = `0 / ${sequenceEntries.length}`;
  progressFill.style.width = '0%';
  progressTrack.setAttribute('aria-valuenow', '0');
  for (const item of preview.children) item.classList.remove('is-current', 'is-past');
}

function showSequencePosition(index) {
  const total = sequenceEntries.length;
  const percentage = total ? Math.round(((index + 1) / total) * 100) : 0;
  progressText.textContent = `${index + 1} / ${total}`;
  progressFill.style.width = `${percentage}%`;
  progressTrack.setAttribute('aria-valuenow', String(percentage));

  for (const item of preview.children) {
    if (!('index' in item.dataset)) continue;
    const itemIndex = Number(item.dataset.index);
    item.classList.toggle('is-current', itemIndex === index);
    item.classList.toggle('is-past', itemIndex < index);
  }

  const current = preview.querySelector(`[data-index="${index}"]`);
  current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function completeProgress() {
  progressText.textContent = `${sequenceEntries.length} / ${sequenceEntries.length}`;
  progressFill.style.width = '100%';
  progressTrack.setAttribute('aria-valuenow', '100');
  for (const item of preview.children) {
    item.classList.remove('is-current');
    if ('index' in item.dataset) item.classList.add('is-past');
  }
}

function renderSequence() {
  const result = parseSequence(noteInput.value);
  sequenceEntries = result.entries;
  preview.replaceChildren();

  if (sequenceEntries.length === 0) {
    const empty = createElement('li', 'sequence-note rest', '暂无音符');
    preview.append(empty);
  } else {
    sequenceEntries.forEach((entry, index) => {
      const item = createElement('li', `sequence-note${entry.type === 'rest' ? ' rest' : ''}`, entry.label);
      item.dataset.index = String(index);
      item.title = entry.type === 'note' ? entry.note.label : '休止一拍';
      preview.append(item);
    });
  }

  if (result.errors.length > 0) {
    const suffix = result.errors.length > 1 ? `（另有 ${result.errors.length - 1} 个错误）` : '';
    inputError.textContent = `${result.errors[0].message}${suffix}`;
    noteInput.classList.add('has-error');
    noteInput.setAttribute('aria-invalid', 'true');
  } else {
    inputError.textContent = '';
    noteInput.classList.remove('has-error');
    noteInput.setAttribute('aria-invalid', 'false');
  }

  resetProgress();
  return result;
}

function cancelPlayback() {
  sessionId += 1;
  clearTimeout(sequenceTimer);
  clearTimeout(manualTimer);
  engine.stopAll();
  highlightPlayingNote(null);
  setTransportPlaying(false);
  resetProgress();
}

function stopPlayback() {
  cancelPlayback();
  setStatus('已停止播放。');
}

async function playManualNote(note) {
  cancelPlayback();
  const currentSession = sessionId;
  highlightPlayingNote(note.midi);
  setStatus(`正在播放 ${note.label}`);

  try {
    await engine.load(note);
    if (currentSession !== sessionId) return;
    await engine.play(note);
    if (currentSession !== sessionId) return;

    manualTimer = setTimeout(() => {
      if (currentSession !== sessionId) return;
      highlightPlayingNote(null);
      setStatus(`${note.label} · 点击其他音符可继续试听`);
    }, 900);
  } catch (error) {
    if (currentSession !== sessionId) return;
    highlightPlayingNote(null);
    setStatus(`播放失败：${error.message}`, true);
  }
}

async function runSequence(index, currentSession) {
  if (currentSession !== sessionId) return;

  if (index >= sequenceEntries.length) {
    if (loopInput.checked && sequenceEntries.length > 0) {
      runSequence(0, currentSession);
    } else {
      highlightPlayingNote(null);
      setTransportPlaying(false);
      completeProgress();
      setStatus('旋律播放完成。');
    }
    return;
  }

  const entry = sequenceEntries[index];
  showSequencePosition(index);

  if (entry.type === 'rest') {
    highlightPlayingNote(null);
    setStatus(`${index + 1} / ${sequenceEntries.length} · 休止一拍`);
  } else {
    highlightPlayingNote(entry.note.midi);
    setStatus(`${index + 1} / ${sequenceEntries.length} · ${entry.note.label}`);
    try {
      await engine.play(entry.note);
    } catch (error) {
      if (currentSession !== sessionId) return;
      cancelPlayback();
      setStatus(`播放失败：${error.message}`, true);
      return;
    }
  }

  if (currentSession !== sessionId) return;
  const noteDuration = 60000 / Number(tempoInput.value);
  sequenceTimer = setTimeout(() => runSequence(index + 1, currentSession), noteDuration);
}

async function startPlayback(event) {
  event?.preventDefault();
  const result = renderSequence();

  if (result.errors.length > 0) {
    cancelPlayback();
    setStatus('请先修正旋律中的无效音符。', true);
    noteInput.focus();
    return;
  }
  if (result.entries.length === 0) {
    cancelPlayback();
    setStatus('请先输入至少一个音符或休止符。', true);
    noteInput.focus();
    return;
  }

  cancelPlayback();
  const currentSession = sessionId;
  setTransportPlaying(true);
  setStatus('正在准备音频…');

  try {
    await engine.unlock();
    const uniqueNotes = new Map(
      result.entries
        .filter((entry) => entry.type === 'note')
        .map((entry) => [entry.note.midi, entry.note]),
    );
    await Promise.all([...uniqueNotes.values()].map((note) => engine.load(note)));
    if (currentSession !== sessionId) return;
    runSequence(0, currentSession);
  } catch (error) {
    if (currentSession !== sessionId) return;
    cancelPlayback();
    setStatus(`无法启动播放：${error.message}`, true);
  }
}

form.addEventListener('submit', startPlayback);
stopButton.addEventListener('click', stopPlayback);

noteInput.addEventListener('input', () => {
  cancelPlayback();
  renderSequence();
  setStatus('旋律已更新，点击播放开始。');
});

for (const button of document.querySelectorAll('[data-example]')) {
  button.addEventListener('click', () => {
    noteInput.value = EXAMPLES[button.dataset.example];
    noteInput.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

tempoInput.addEventListener('input', () => {
  tempoValue.textContent = `${tempoInput.value} BPM`;
});

volumeInput.addEventListener('input', () => {
  volumeValue.textContent = `${volumeInput.value}%`;
  engine.setVolume(Number(volumeInput.value) / 100);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    stopPlayback();
    return;
  }

  const interactiveTags = new Set(['INPUT', 'TEXTAREA', 'BUTTON', 'A', 'SELECT']);
  if (
    event.code === 'Space'
    && !event.repeat
    && !interactiveTags.has(document.activeElement?.tagName)
  ) {
    event.preventDefault();
    if (isPlaying) stopPlayback();
    else startPlayback();
  }
});

engine.setVolume(Number(volumeInput.value) / 100);
buildFingerboard();
renderSequence();
