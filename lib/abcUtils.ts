// Utility functions for ABC notation manipulation

interface ParsedNote {
  pitch: string;
  octave: number;
  accidental?: string;
  duration?: string;
  startIndex: number;
  endIndex: number;
  originalString: string;
}

// Map staff Y positions to note pitches
const STAFF_POSITIONS = [
  { y: 0, note: "c'", octave: 2 },    // High C
  { y: 5, note: "b", octave: 1 },
  { y: 10, note: "a", octave: 1 },
  { y: 15, note: "g", octave: 1 },
  { y: 20, note: "f", octave: 1 },
  { y: 25, note: "e", octave: 1 },
  { y: 30, note: "d", octave: 1 },
  { y: 35, note: "c", octave: 1 },
  { y: 40, note: "B", octave: 0 },
  { y: 45, note: "A", octave: 0 },
  { y: 50, note: "G", octave: 0 },
  { y: 55, note: "F", octave: 0 },
  { y: 60, note: "E", octave: 0 },
  { y: 65, note: "D", octave: 0 },
  { y: 70, note: "C", octave: 0 },
  { y: 75, note: "B,", octave: -1 },
  { y: 80, note: "A,", octave: -1 },
];

// Parse a single note from ABC notation
export function parseNote(noteStr: string, startIndex: number): ParsedNote | null {
  const noteRegex = /^(\^|_|=)?([A-Ga-g])([,']*)?(\d+|\/\d+)?/;
  const match = noteStr.match(noteRegex);

  if (!match) return null;

  const [fullMatch, accidental, pitch, octaveModifier, duration] = match;

  let octave = 0;
  if (pitch >= 'a' && pitch <= 'g') {
    octave = 1; // Lower case = higher octave
  }

  // Count apostrophes (raise octave) and commas (lower octave)
  if (octaveModifier) {
    const apostrophes = (octaveModifier.match(/'/g) || []).length;
    const commas = (octaveModifier.match(/,/g) || []).length;
    octave += apostrophes - commas;
  }

  return {
    pitch,
    octave,
    accidental: accidental || undefined,
    duration: duration || undefined,
    startIndex,
    endIndex: startIndex + fullMatch.length,
    originalString: fullMatch
  };
}

// Parse all notes from a line of ABC notation
export function parseABCLine(line: string): ParsedNote[] {
  const notes: ParsedNote[] = [];
  let i = 0;

  while (i < line.length) {
    // Skip whitespace and bar lines
    if (line[i] === ' ' || line[i] === '|' || line[i] === ']' || line[i] === '[') {
      i++;
      continue;
    }

    // Try to parse a note
    const note = parseNote(line.substring(i), i);
    if (note) {
      notes.push(note);
      i = note.endIndex;
    } else {
      i++;
    }
  }

  return notes;
}

// Convert Y position to nearest note pitch
export function yPositionToNote(yPos: number): string {
  // Find the closest staff position
  let closestPosition = STAFF_POSITIONS[0];
  let minDistance = Math.abs(yPos - closestPosition.y);

  for (const position of STAFF_POSITIONS) {
    const distance = Math.abs(yPos - position.y);
    if (distance < minDistance) {
      minDistance = distance;
      closestPosition = position;
    }
  }

  return closestPosition.note;
}

// Update a note at a specific position in the ABC string
export function updateNoteInABC(
  abcNotation: string,
  noteIndex: number,
  newPitch: string,
  preserveAccidental: boolean = true,
  preserveDuration: boolean = true
): string {
  const lines = abcNotation.split('\n');

  // Find the line containing music (not headers)
  let musicLineIndex = -1;
  let cumulativeIndex = 0;
  let noteCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip header lines
    if (line.includes(':') || line.startsWith('%') || line.trim() === '') {
      continue;
    }

    // This is a music line
    const notesInLine = parseABCLine(line);
    if (noteCount + notesInLine.length > noteIndex) {
      // Found the line containing our note
      musicLineIndex = i;
      const localNoteIndex = noteIndex - noteCount;
      const targetNote = notesInLine[localNoteIndex];

      if (targetNote) {
        // Build the new note string
        let newNoteStr = '';
        if (preserveAccidental && targetNote.accidental) {
          newNoteStr += targetNote.accidental;
        }
        newNoteStr += newPitch;
        if (preserveDuration && targetNote.duration) {
          newNoteStr += targetNote.duration;
        }

        // Replace in the line
        const before = line.substring(0, targetNote.startIndex);
        const after = line.substring(targetNote.endIndex);
        lines[i] = before + newNoteStr + after;
      }
      break;
    }

    noteCount += notesInLine.length;
  }

  return lines.join('\n');
}

// Get bounding box info for a note element
export function getNoteElementInfo(element: SVGElement): { x: number, y: number, width: number, height: number } | null {
  try {
    const bbox = (element as any).getBBox();
    return {
      x: bbox.x,
      y: bbox.y,
      width: bbox.width,
      height: bbox.height
    };
  } catch (e) {
    // Fallback to getBoundingClientRect
    const rect = element.getBoundingClientRect();
    const svg = element.closest('svg');
    if (svg) {
      const svgRect = svg.getBoundingClientRect();
      return {
        x: rect.left - svgRect.left,
        y: rect.top - svgRect.top,
        width: rect.width,
        height: rect.height
      };
    }
  }
  return null;
}

// Calculate the pitch change based on vertical movement
export function calculatePitchChange(deltaY: number, staffSpacing: number = 5): number {
  // Each staff line/space represents a pitch change
  // Negative deltaY means moving up (higher pitch)
  return -Math.round(deltaY / staffSpacing);
}

// Transpose a note by a number of semitones
export function transposeNote(note: string, semitones: number): string {
  const noteMap = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const steps = [2, 2, 1, 2, 2, 2, 1]; // Whole and half steps

  // Parse the note
  const isLowerCase = note[0] >= 'a' && note[0] <= 'g';
  const basePitch = note[0].toUpperCase();
  const noteIndex = noteMap.indexOf(basePitch);

  if (noteIndex === -1) return note; // Invalid note

  // Calculate new note
  let newIndex = noteIndex;
  let octaveChange = 0;

  for (let i = 0; i < Math.abs(semitones); i++) {
    if (semitones > 0) {
      newIndex++;
      if (newIndex >= noteMap.length) {
        newIndex = 0;
        octaveChange++;
      }
    } else {
      newIndex--;
      if (newIndex < 0) {
        newIndex = noteMap.length - 1;
        octaveChange--;
      }
    }
  }

  let newNote = noteMap[newIndex];

  // Handle octave changes and case
  if (isLowerCase) {
    newNote = newNote.toLowerCase();
  }

  // Add octave markers
  if (octaveChange > 0) {
    newNote += "'".repeat(octaveChange);
  } else if (octaveChange < 0) {
    newNote += ",".repeat(-octaveChange);
  }

  return newNote;
}

// Helper to identify if an element is a note in the rendered SVG
export function isNoteElement(element: Element): boolean {
  const classes = element.getAttribute('class') || '';
  return classes.includes('abcjs-note') ||
         classes.includes('abcjs-note_selected') ||
         element.tagName === 'ellipse'; // Note heads are often ellipses
}