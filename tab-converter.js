// ─── Shared UI Helpers ──────────────────────────────────────────────────────
// Each page must define refreshOutput() — called after octave/transpose changes.

function transposeLabel(offset) {
  if (offset === 0) return '<span class="offset-zero">0 semitones</span>';
  const arrow = offset > 0 ? '↑' : '↓';
  const sign  = offset > 0 ? '+' : '';
  return `<span class="offset-val">${arrow}${Math.abs(offset)} st &nbsp;(${sign}${offset})</span>`;
}

function updateOctaveDisplay() {
  const el = document.getElementById('octaveDisplay');
  if (octaveOffset === 0) {
    el.innerHTML = '<span class="offset-zero">0</span>';
  } else {
    const arrow = octaveOffset > 0 ? '↑' : '↓';
    el.innerHTML = `<span class="offset-val">${arrow}${Math.abs(octaveOffset)} oct</span>`;
  }
}

function adjustOctave(delta) {
  octaveOffset = Math.max(-3, Math.min(3, octaveOffset + delta));
  updateOctaveDisplay();
  refreshOutput();
}

function resetOctave() {
  octaveOffset = 0;
  updateOctaveDisplay();
  refreshOutput();
}

// ─── Shared Tuning Data ─────────────────────────────────────────────────────
const TUNING_OPEN = {
  standard: [['E',2],['A',2],['D',3],['G',3],['B',3],['E',4]],
  dropD:    [['D',2],['A',2],['D',3],['G',3],['B',3],['E',4]],
  openG:    [['D',2],['G',2],['D',3],['G',3],['B',3],['D',4]],
  openE:    [['E',2],['B',2],['E',3],['G',3,'#'],['B',3],['E',4]],
  crowder:  [['E',2],['A',2],['E',3],['E',3],['B',3],['E',4]],
  dadgad:   [['D',2],['A',2],['D',3],['G',3],['A',3],['D',4]],
  violin:   [['G',3],['D',4],['A',4],['E',5]],
  cello:    [['C',2],['G',2],['D',3],['A',3]],
  viola:    [['C',3],['G',3],['D',4],['A',4]],
};

const TUNING_NAMES = {
  standard: ['E','A','D','G','B','e'],
  dropD:    ['D','A','D','G','B','e'],
  openG:    ['D','G','D','G','B','D'],
  openE:    ['E','B','E','G#','B','E'],
  crowder:  ['E','A','E','E','B','E'],
  dadgad:   ['D','A','D','G','A','D'],
  violin:   ['G','D','A','E'],
  cello:    ['C','G','D','A'],
  viola:    ['C','G','D','A'],
};

const TUNING_LABEL = {
  standard: 'Standard', dropD: 'Drop D', openG: 'Open G',
  openE: 'Open E', crowder: 'Crowder', dadgad: 'DADGAD', violin: 'Violin',
  viola: 'Viola', cello: 'Cello',
};

// ─── Shared Pitch Helpers ────────────────────────────────────────────────────
const NOTE_SEMITONES = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };

function noteToPitch(note, octave, acc) {
  let pitch = octave * 12 + NOTE_SEMITONES[note];
  if (acc === '#') pitch++;
  if (acc === 'b') pitch--;
  return pitch;
}

function openPitch(tuningKey, stringIndex) {
  const [note, octave, acc = ''] = TUNING_OPEN[tuningKey][stringIndex];
  return noteToPitch(note, octave, acc);
}

// ─── Staff → Tab Conversion ──────────────────────────────────────────────────
// Used by home.html. beats[i] = { x, notes: [{note, octave, accidental}] }
// barlines = array of globalX positions; beatsPerSys and beatWidth control wrapping.
function buildStaffTabOutput(instrTuningKey, offset, beats, barlines, beatsPerSys, beatWidth) {
  const numStrings = TUNING_OPEN[instrTuningKey].length;
  const tuningNames = TUNING_NAMES[instrTuningKey];
  let prevPositions = Array(numStrings).fill(null);
  const tabBeats = [];

  beats.forEach(beat => {
    const beatFrets = Array(numStrings).fill(null);
    const chordNotes = beat.notes.map(n => ({
      pitch: noteToPitch(n.note, n.octave, n.accidental) + offset,
      ...n
    })).sort((a, b) => a.pitch - b.pitch);

    const usedStrings = new Set();
    chordNotes.forEach(cn => {
      const options = [];
      for (let si = 0; si < numStrings; si++) {
        if (usedStrings.has(si)) continue;
        const open = noteToPitch(...TUNING_OPEN[instrTuningKey][si], '');
        const fret = cn.pitch - open;
        if (fret >= 0 && fret <= 22) options.push({ string: si, fret });
      }
      if (!options.length) return;
      const avgPrev = prevPositions.filter(p => p !== null);
      const centerPos = avgPrev.length ? avgPrev.reduce((a,b)=>a+b,0)/avgPrev.length : 2;
      options.sort((a,b) => {
        const da = Math.abs(a.fret - centerPos) + a.fret * 0.3;
        const db = Math.abs(b.fret - centerPos) + b.fret * 0.3;
        return da - db;
      });
      const best = options[0];
      beatFrets[best.string] = best.fret;
      usedStrings.add(best.string);
      prevPositions[best.string] = best.fret;
    });

    tabBeats.push(beatFrets);
  });

  const displayOrder = Array.from({length: numStrings}, (_, i) => numStrings - 1 - i);

  const columns = [];
  tabBeats.forEach((beat, bi) => {
    const beatX = beats[bi].x;
    const prevBeatX = bi > 0 ? beats[bi - 1].x : 0;
    barlines.forEach(bx => {
      if (bx > prevBeatX && bx <= beatX - beatWidth / 2) {
        columns.push({ type: 'bar' });
      }
    });
    columns.push({ type: 'beat', idx: bi });
  });
  const lastBeatX = beats.length ? beats[beats.length - 1].x : 0;
  barlines.forEach(bx => {
    if (bx > lastBeatX) columns.push({ type: 'bar' });
  });

  const wrappedBlocks = [];
  let curBlock = [];
  let beatsInBlock = 0;
  columns.forEach(col => {
    if (col.type === 'beat') {
      if (beatsInBlock >= beatsPerSys) {
        wrappedBlocks.push(curBlock);
        curBlock = [];
        beatsInBlock = 0;
      }
      curBlock.push(col);
      beatsInBlock++;
    } else {
      curBlock.push(col);
    }
  });
  if (curBlock.length) wrappedBlocks.push(curBlock);

  const blockStrings = wrappedBlocks.map(blockCols => {
    const blockLines = displayOrder.map(si => ({ name: tuningNames[si].padEnd(2), cells: [] }));
    blockCols.forEach(col => {
      displayOrder.forEach((si, li) => {
        if (col.type === 'bar') {
          blockLines[li].cells.push({ bar: true });
        } else {
          const v = tabBeats[col.idx][si];
          blockLines[li].cells.push({ val: v === null ? '-' : String(v) });
        }
      });
    });

    const blockColWidths = blockCols.map((col, ci) => {
      if (col.type === 'bar') return 0;
      return Math.max(...blockLines.map(l => l.cells[ci].val ? l.cells[ci].val.length : 0), 1) + 1;
    });

    return blockLines.map(line => {
      let row = line.name + '|';
      line.cells.forEach((cell, ci) => {
        if (cell.bar) {
          row += '|';
        } else {
          const w = blockColWidths[ci];
          row += cell.val + '-'.repeat(w - cell.val.length) + '-';
        }
      });
      return row + '|';
    }).join('\n');
  });

  const transposeLine = offset === 0 ? ''
    : `  Offset: ${offset > 0 ? '+' : ''}${offset} semitones\n`;

  return '  Tuning: ' + tuningNames.slice().reverse().join('-') + '  (high → low)\n' +
    transposeLine + '\n' +
    blockStrings.join('\n\n');
}

// ─── Tab → Tab Conversion ────────────────────────────────────────────────────
// Used by tab-converter.html. beats[i] = { pitches: [p0..pN | null], barBefore, width }
// rowLengths controls how output is split to match input block boundaries.
function buildTabOutput(beats, tuningKey, semitoneOffset, rowLengths) {
  if (!beats.length) return '';

  const names = TUNING_NAMES[tuningKey];
  const numStrings = TUNING_OPEN[tuningKey].length;
  let prevFrets = new Array(numStrings).fill(null);

  const tabBeats = beats.map(beat => {
    const frets = new Array(numStrings).fill(null);
    const usedStrings = new Set();

    const notes = beat.pitches
      .map((p, si) => p !== null ? { pitch: p + semitoneOffset, srcSi: si } : null)
      .filter(Boolean)
      .sort((a, b) => a.pitch - b.pitch);

    notes.forEach(n => {
      const options = [];
      for (let si = 0; si < numStrings; si++) {
        if (usedStrings.has(si)) continue;
        const fret = n.pitch - openPitch(tuningKey, si);
        if (fret >= 0 && fret <= 24) options.push({ si, fret });
      }
      if (!options.length) return;

      const validPrev = prevFrets.filter(f => f !== null);
      const center = validPrev.length ? validPrev.reduce((a, b) => a + b, 0) / validPrev.length : 3;
      options.sort((a, b) => {
        const da = Math.abs(a.fret - center) + a.fret * 0.25;
        const db = Math.abs(b.fret - center) + b.fret * 0.25;
        return da - db;
      });
      const best = options[0];
      frets[best.si] = best.fret;
      usedStrings.add(best.si);
      prevFrets[best.si] = best.fret;
    });

    return { frets, barBefore: beat.barBefore, width: beat.width };
  });

  const displayOrder = Array.from({ length: numStrings }, (_, i) => numStrings - 1 - i);

  const rows = [];
  let idx = 0;
  (rowLengths || [tabBeats.length]).forEach(len => {
    if (len > 0) rows.push(tabBeats.slice(idx, idx + len));
    idx += len;
  });
  if (idx < tabBeats.length) rows.push(tabBeats.slice(idx));

  const rowStrings = rows.map(row => {
    const colWidths = row.map(beat => {
      const maxFretLen = Math.max(
        ...displayOrder.map(si => {
          const f = beat.frets[si];
          return f === null ? 1 : String(f).length;
        }), 1
      );
      return Math.max((beat.width ?? maxFretLen + 2) - 1, maxFretLen);
    });

    return displayOrder.map(si => {
      let line = names[si].padEnd(2) + '|';
      row.forEach((beat, ci) => {
        if (beat.barBefore && ci > 0) line += '|';
        const f = beat.frets[si];
        const s = f === null ? '-' : String(f);
        line += s + '-'.repeat(colWidths[ci] - s.length) + '-';
      });
      return line + '|';
    }).join('\n');
  });

  const transposeLine = semitoneOffset === 0 ? ''
    : `  Offset: ${semitoneOffset > 0 ? '+' : ''}${semitoneOffset} semitones\n`;

  return '  Tuning: ' + names.slice().reverse().join('-') + '  (high → low)\n' +
    transposeLine + '\n' +
    rowStrings.join('\n\n');
}
