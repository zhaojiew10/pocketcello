export const MIN_MIDI = 36; // C2
export const MAX_MIDI = 69; // A4

const PITCH_CLASSES = [
  { natural: 'C' },
  { sharp: 'C#', flat: 'Db', sharpLetter: 'C', flatLetter: 'D' },
  { natural: 'D' },
  { sharp: 'D#', flat: 'Eb', sharpLetter: 'D', flatLetter: 'E' },
  { natural: 'E' },
  { natural: 'F' },
  { sharp: 'F#', flat: 'Gb', sharpLetter: 'F', flatLetter: 'G' },
  { natural: 'G' },
  { sharp: 'G#', flat: 'Ab', sharpLetter: 'G', flatLetter: 'A' },
  { natural: 'A' },
  { sharp: 'A#', flat: 'Bb', sharpLetter: 'A', flatLetter: 'B' },
  { natural: 'B' },
];

const LETTER_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const REST_TOKENS = new Set(['-', '_', 'r', 'rest', '休止']);

export function getNote(midi) {
  if (!Number.isInteger(midi) || midi < MIN_MIDI || midi > MAX_MIDI) return null;

  const octave = Math.floor(midi / 12) - 1;
  const pitch = PITCH_CLASSES[midi % 12];
  const isAccidental = !pitch.natural;
  const sharpName = isAccidental ? pitch.sharp : pitch.natural;
  const flatName = isAccidental ? pitch.flat : pitch.natural;
  const file = isAccidental
    ? `sharp${pitch.sharpLetter}${octave}flat${pitch.flatLetter}${octave}`
    : `${pitch.natural}${octave}`;

  return {
    midi,
    octave,
    isAccidental,
    sharpName,
    flatName,
    label: isAccidental ? `${sharpName}${octave}/${flatName}${octave}` : `${sharpName}${octave}`,
    shortLabel: `${sharpName}${octave}`,
    displaySharp: `${sharpName.replace('#', '♯')}${octave}`,
    displayFlat: `${flatName.replace('b', '♭')}${octave}`,
    audio: `audio/${file}.mp3`,
  };
}

export const NOTES = Array.from(
  { length: MAX_MIDI - MIN_MIDI + 1 },
  (_, index) => getNote(MIN_MIDI + index),
);

export const STRINGS = [
  { id: 'A', name: 'A 弦', startMidi: 57, description: 'A3–A4', rgb: '224, 174, 94' },
  { id: 'D', name: 'D 弦', startMidi: 50, description: 'D3–D4', rgb: '117, 181, 157' },
  { id: 'G', name: 'G 弦', startMidi: 43, description: 'G2–G3', rgb: '112, 153, 207' },
  { id: 'C', name: 'C 弦', startMidi: 36, description: 'C2–C3', rgb: '188, 128, 119' },
];

function parseNotePart(rawPart) {
  const part = rawPart
    .trim()
    .replaceAll('♯', '#')
    .replaceAll('♭', 'b');

  let match = part.match(/^([A-Ga-g])([#b]?)(\d)$/);
  if (match) {
    const [, letter, accidental, octave] = match;
    return { letter: letter.toUpperCase(), accidental, octave: Number(octave) };
  }

  // 兼容原项目的 #A3、bB3 写法。
  match = part.match(/^([#b])([A-Ga-g])(\d)$/);
  if (match) {
    const [, accidental, letter, octave] = match;
    return { letter: letter.toUpperCase(), accidental, octave: Number(octave) };
  }

  return null;
}

function partToMidi(part) {
  const semitone = LETTER_SEMITONES[part.letter];
  const accidentalOffset = part.accidental === '#' ? 1 : part.accidental === 'b' ? -1 : 0;
  return (part.octave + 1) * 12 + semitone + accidentalOffset;
}

export function parseNote(token) {
  if (typeof token !== 'string' || !token.trim()) return null;

  const parts = token.trim().split('/');
  if (parts.length > 2 || parts.some((part) => !part.trim())) return null;

  const parsedParts = parts.map(parseNotePart);
  if (parsedParts.some((part) => part === null)) return null;

  const midi = partToMidi(parsedParts[0]);
  if (parsedParts.length === 2 && partToMidi(parsedParts[1]) !== midi) return null;

  return getNote(midi);
}

export function parseSequence(input) {
  const entries = [];
  const errors = [];
  if (typeof input !== 'string' || !input.trim()) return { entries, errors };

  const tokens = input.trim().split(/[\s,，;；]+/).filter(Boolean);
  for (const token of tokens) {
    if (REST_TOKENS.has(token.toLowerCase())) {
      entries.push({ type: 'rest', token, label: '休止' });
      continue;
    }

    const note = parseNote(token);
    if (note) {
      entries.push({ type: 'note', token, note, label: note.shortLabel });
    } else {
      errors.push({ token, message: `无法识别“${token}”，可用范围为 C2–A4。` });
    }
  }

  return { entries, errors };
}
