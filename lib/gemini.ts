import { GoogleGenerativeAI } from "@google/generative-ai";

interface UploadAndAnalyzeOptions {
  apiKey: string;
  videoTempPath: string; // local filesystem path to uploaded video
  displayName?: string;
}

// Public-facing musical event (symbolic pitch only)
export type NoteType = 'sixteenth' | 'eighth' | 'quarter' | 'half' | 'whole';
export interface MusicalEvent {
  noteName: string;   // symbolic pitch (e.g., C4, D#4, Bb3)
  time: number;       // ms start
  duration: number;   // ms duration (snapped to canonical for its noteType)
  noteType: NoteType; // categorical rhythmic value
  velocity?: number;  // 30 - 110
}

export interface MusicalPlan { events: MusicalEvent[] }

// Internal event representation retains numeric MIDI note for processing
interface InternalEvent {
  noteName: string;  // canonical symbolic (guaranteed)
  time: number;      // ms
  duration: number;  // ms
  velocity?: number; // 30 - 110
}

// Video analysis types
export interface VideoSegment {
  startMs: number;
  endMs: number;
  intensity: number; // 0..1 (motion / action energy)
  mood: string;      // short descriptor (e.g., "tense", "calm", "explosive")
  action: string;    // concise description of visible action
  motionSpeed?: number; // 1..10 (added for rhythmic mapping)
}

export interface VideoAnalysis {
  durationMs: number;
  segments: VideoSegment[];
  notes?: string;
}

// Base model fallback updated to a higher-quality model for better instruction adherence & variation.
// Override with GEMINI_MODEL to change without code edits.
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-pro";
// Optional per-stage overrides:
//   GEMINI_ANALYSIS_MODEL - used for video analysis (often fine to keep a cheaper/faster model)
//   GEMINI_COMPOSE_MODEL  - used for musical plan generation (benefits from higher reasoning / adherence)
const ANALYSIS_MODEL = process.env.GEMINI_ANALYSIS_MODEL || DEFAULT_MODEL;
const COMPOSE_MODEL  = process.env.GEMINI_COMPOSE_MODEL  || DEFAULT_MODEL;

// --- Pitch name helpers ---
const PITCH_CLASS: string[] = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const LETTER_TO_PC: Record<string, number> = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };

function noteNameToMidi(name: string): number | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  const m = trimmed.match(/^([A-Ga-g])([#b♭♯]?)(-?\d{1,2})$/);
  if (!m) return null;
  let [, letter, accidental, octaveStr] = m;
  letter = letter.toUpperCase();
  const base = LETTER_TO_PC[letter];
  if (base === undefined) return null;
  let pc = base;
  if (accidental === '#' || accidental === '♯') pc += 1;
  if (accidental === 'b' || accidental === '♭') pc -= 1;
  pc = (pc + 12) % 12;
  const octave = parseInt(octaveStr, 10);
  // MIDI formula: C4 = 60 => 12 * (octave + 1) + pc
  const midi = 12 * (octave + 1) + pc;
  if (midi < 0 || midi > 127) return null;
  return midi;
}

function midiToNoteName(n: number): string {
  const pc = ((n % 12) + 12) % 12;
  const octave = Math.floor(n / 12) - 1;
  return `${PITCH_CLASS[pc]}${octave}`;
}

// Upload via REST (Files API). Returns { uri, mimeType }
export async function uploadVideoFile({ apiKey, videoTempPath, displayName = "uploaded-video" }: UploadAndAnalyzeOptions) {
  const fs = await import('fs');
  const data = await fs.promises.readFile(videoTempPath);
  const res = await fetch('https://generativelanguage.googleapis.com/upload/v1beta/files?key=' + apiKey, {
    method: 'POST',
    headers: {
      'Content-Type': 'video/mp4',
      'X-Goog-Upload-File-Name': displayName + '.mp4',
      'X-Goog-Upload-Protocol': 'raw'
    },
    body: new Uint8Array(data)
  });
  if (!res.ok) {
    throw new Error('File upload failed: ' + res.status + ' ' + await res.text());
  }
  const json: any = await res.json();
  return { uri: json.file?.uri || json.uri, mimeType: 'video/mp4' };
}

export async function requestMusicalPlan(
  apiKey: string,
  fileUri: string,
  mimeType: string,
  targetDurationMs: number,
  extraContext?: any
): Promise<MusicalPlan> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: COMPOSE_MODEL });
  const minEvents = Math.max(Math.ceil((targetDurationMs || 0) / 1000), 16); // at least 1 per second, baseline 16

  // Attempt structured JSON response using responseMimeType / responseSchema (supported on newer SDK versions)
  const generationConfig: any = {
    temperature: 1.2,
    maxOutputTokens: 4096,
    responseMimeType: "application/json",
    responseSchema: {
      type: "OBJECT",
      properties: {
        events: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              noteName: { type: "STRING" },
              time: { type: "INTEGER" },
              duration: { type: "INTEGER" },
              noteType: { type: "STRING" },
              velocity: { type: "INTEGER" }
            },
            required: ["noteName", "time", "duration", "noteType"]
          }
        }
      },
      required: ["events"]
    }
  };

  const systemPrompt = `You generate concise musical event plans for videos. Ensure coverage across full duration.`;

  const randomSeed = Math.floor(Math.random() * 1000000);
  const userPrompt = `Create a UNIQUE and HIGHLY VARIED musical event plan for the attached video. Seed: ${randomSeed}
ABSOLUTE RULES (MUST create different music each time - reject ALL repeating patterns):
1. TOTAL TARGET DURATION (ms): ${targetDurationMs}
2. At least one event per second of video => MIN_EVENTS = ${minEvents}. Provide between ${minEvents} and ${Math.max(minEvents+40, 60)} events.
3. Output strictly JSON: { "events": [ { "noteName": "C4", "time": 0, "duration": 240, "noteType": "eighth", "velocity": 78 }, ... ] }. USE "noteName" ONLY. Do NOT include a numeric "note" field.
4. noteType must be one of: "sixteenth" (~125ms), "eighth" (~250ms), "quarter" (~500ms), "half" (~1000ms), "whole" (~2000ms). Provide BOTH a numeric integer duration (ms) AND its categorical noteType. Keep duration within ±15% of canonical for that noteType. Total coverage ~ target duration. duration IS REQUIRED.
5. Distribution target by count (approximate): sixteenth 5-20%, eighth 20-35%, quarter 25-35%, half 10-20%, whole up to 10%. No chain of identical noteType longer than 3.
6. Melodic & register variation: include steps (±2 semitones) and occasional leaps (3-9 semitones). No more than 3 consecutive notes with identical pitch. Avoid repeating an entire 4-note pitch pattern more than once. USE WIDE REGISTER C2..C6: include at least 4 events at or below G3 AND at least 4 events at or above A5, unless clip is < 5s.
7. CRITICAL RHYTHMIC VARIATION: Rhythm MUST reflect motion_speed. High (8-10) => more eighth, some quarter and bursts; mid (4-7) => quarter/half mix; low (1-3) => half + whole with gaps (rests of 400-900ms).
8. Harmony: allow up to 2 simultaneous overlapping events occasionally (never more than 2 starting at same ms). Overlaps should be less than 40% of total events.
9. Dynamic contour (velocity):
   - Intro (first 15% of duration): mostly 55-70
   - Build (15%-55%): 70-90
   - Climax (55%-80%): 90-110 with several peaks
   - Resolution (final 20%): 60-80
10. Final event end time (time + mapped noteType ms) within ±2% of ${targetDurationMs}. Don't undershoot.
11. Provide at least 3 rests/gaps (no events) sized via noteType spacing.
12. JSON ONLY.
13. STARTING DIVERSITY: NEVER begin on the same note twice. Use seed ${randomSeed % 12} to pick starting pitch class. First 6-8 events MUST span at least THREE distinct octaves with large intervallic leaps. Randomly select tonic from: ${['C', 'D', 'E', 'F', 'G', 'A', 'B'][randomSeed % 7]} + random octave.
14. PITCH DISTRIBUTION: Ensure extreme register variety. Use at least 5 notes below C3 and 5 notes above C6. Create unpredictable melodic contours with sudden jumps, chromatic runs, and wide intervals.
15. MAXIMUM VARIETY: Generate completely different patterns every time. Use random rhythmic groupings (3s, 5s, 7s), syncopation, and irregular timing. Mix staccato and legato. Add grace notes and trills. BE CREATIVE and EXPERIMENTAL. This is generative art - embrace chaos and unpredictability!
NEGATIVE RHYTHMIC EXAMPLE: repeating identical noteType chain >3.
Return ONLY the JSON object.`;

  let response;
  try {
    response = await model.generateContent({
      contents: [
        { role: "system", parts: [{ text: systemPrompt }] },
        { role: "user", parts: [
          { fileData: { fileUri, mimeType } },
          { text: userPrompt },
          ...(extraContext ? [{ text: JSON.stringify(extraContext).slice(0, 4000) }] : [])
        ] }
      ],
      generationConfig
    });
  } catch (err) {
    console.warn("[gemini] Structured generation failed, falling back to text parse.", err);
    // Fallback without schema
    response = await model.generateContent({
      contents: [
        { role: "user", parts: [
          { fileData: { fileUri, mimeType } },
          { text: userPrompt + " If you cannot enforce JSON schema, still output raw JSON object now." }
        ] }
      ],
      generationConfig: { temperature: 0.9 }
    });
  }

  const text = (response as any)?.response?.text?.() || (response as any)?.response?.candidates?.[0]?.content?.parts?.map((p: any)=>p.text).join("\n") || "";

  // Try to find JSON
  let jsonStr = text.trim();
  if (!jsonStr.startsWith("{")) {
    const match = jsonStr.match(/\{[\s\S]*\}/);
    if (match) jsonStr = match[0];
  }

  let parsed: any;
  try { parsed = JSON.parse(jsonStr); } catch (e) { parsed = {}; }

  let events: InternalEvent[] = Array.isArray(parsed.events) ? parsed.events : [];

  const diagnostics: Record<string, any> = { parseTextLength: text.length };

  // Accept either numeric note or noteName (e.g., "C4", "D#5")
  events = events.map((raw: any) => {
    let name: string | undefined = typeof raw.noteName === 'string' ? raw.noteName : undefined;
    if (!name && typeof raw.pitch === 'string') name = raw.pitch;
    if (!name) return null;
    const midi = noteNameToMidi(name);
    if (midi == null) return null;
  const clampedMidi = Math.min(96, Math.max(36, midi));
    name = midiToNoteName(clampedMidi);
    const time = Math.max(0, Math.round(Number(raw.time)));
    // derive internal ms duration from noteType or legacy numeric duration
    let ms = 0;
    if (typeof raw.noteType === 'string') {
      const nt = raw.noteType.toLowerCase();
      ms = nt === 'sixteenth' ? 125 : nt === 'eighth' ? 250 : nt === 'quarter' ? 500 : nt === 'half' ? 1000 : nt === 'whole' ? 2000 : 500;
    } else if (typeof raw.duration === 'number') {
      const d = raw.duration;
      ms = d < 190 ? 125 : d < 375 ? 250 : d < 750 ? 500 : d < 1500 ? 1000 : 2000;
    } else {
      ms = 500; // default quarter
    }
    if (!Number.isFinite(time) || !Number.isFinite(ms)) return null;
    const velocity = Math.min(110, Math.max(40, Math.round(Number(raw.velocity ?? 80))));
    return { noteName: name, time, duration: ms, velocity } as InternalEvent;
  }).filter(Boolean) as InternalEvent[];

  if (events.length === 0) {
    // Fallback deterministic scaffold with more rhythmic variety
    const baseDur = targetDurationMs || 8000;
    const step = baseDur / 24;
    events = Array.from({ length: 24 }).map((_, i) => {
      const phase = i / 24;
      const durCategory = i % 6;
      const duration = durCategory < 3 ? 220 + (i % 3) * 40 : durCategory < 5 ? 520 + (i % 4) * 80 : 1200;
      const velocity = phase < 0.2 ? 60 + (i % 4) * 4 : phase < 0.6 ? 75 + (i % 5) * 5 : phase < 0.85 ? 90 + (i % 3) * 6 : 70 + (i % 4) * 5;
      const midi = 60 + ((i * 5) % 16);
      return {
  noteName: midiToNoteName(Math.min(96, Math.max(36, midi))),
        time: Math.round(i * step),
        duration: Math.round(Math.min(1800, duration)),
        velocity: Math.min(110, velocity)
      } as InternalEvent;
    });
  }

  const earlyUnique = new Set(events.map(e=>e.noteName)).size;
  const earlyDurDistinct = new Set(events.map(e=>e.duration)).size;
  diagnostics.initialUniquePitches = earlyUnique;
  diagnostics.initialDistinctDurations = earlyDurDistinct;
  diagnostics.initialEventCount = events.length;

  // Early monotony guard: if too few unique pitches or durations, inject short passing notes & register shifts before heavy processing
  if (earlyUnique <= 4 || earlyDurDistinct <= 2) {
    const injected: InternalEvent[] = [];
    for (let i=0;i<events.length && injected.length < 6;i++) {
      const e = events[i];
      const midi = noteNameToMidi(e.noteName)!;
  const shifted = Math.min(96, Math.max(36, midi + ((i%2)?5:-3)));
      injected.push({
        noteName: midiToNoteName(shifted),
        time: e.time + Math.round(e.duration * 0.45),
        duration: Math.max(160, Math.round(e.duration * 0.35)),
        velocity: Math.min(110, (e.velocity ?? 80) + 10)
      });
    }
    if (injected.length) {
      events = events.concat(injected).sort((a,b)=>a.time-b.time);
      diagnostics.earlyInjection = injected.length;
    }
  }

  // ---------------- Pitch / Variation Enhancement Layer (pre-enrichment) ----------------
  // Objective: reduce simple 4-note loops by (a) mapping to scale derived from mood, (b) intensity-based register shifts,
  // (c) rhythm perturbation if durations are uniform, and (d) injecting passing/neighbor tones if pitch variety too low.
  try {
    const ctx = extraContext as any | undefined;
    const videoAnalysis = ctx?.videoAnalysis;
  const moodWords: string[] = (videoAnalysis?.segments || []).map((s: any)=>String(s.mood||'')).filter(Boolean);
    const moodStr = moodWords.join(' ').toLowerCase();
  // Enhanced scale selection with more variety and randomness
  const scaleOptions: Array<'minor' | 'major' | 'dorian' | 'mixolydian' | 'lydian' | 'phrygian'> = ['minor', 'major', 'dorian', 'mixolydian', 'lydian', 'phrygian'];
  let scaleType = scaleOptions[Math.floor(Math.random() * scaleOptions.length)];
  const positiveRe = /(calm|bright|happy|celebrat|victor|joy|excite|triumph|uplift|cheer)/;
  const negativeRe = /(sad|dark|intense|pressure|critical|defeat|loss|melanch|gloom|somber|tense)/;
  const buildRe = /(build|rising|crowd|energy|energetic|hype)/;
  const resolveRe = /(resolve|cooldown|transition|release|settle)/;
  // Add some randomness to scale selection even with mood hints
  const moodInfluence = Math.random();
  if (moodInfluence > 0.3) { // 70% chance to follow mood
    if (positiveRe.test(moodStr) && !negativeRe.test(moodStr)) scaleType = Math.random() > 0.3 ? 'major' : 'lydian';
    else if (negativeRe.test(moodStr) && !positiveRe.test(moodStr)) scaleType = Math.random() > 0.3 ? 'minor' : 'phrygian';
    else if (buildRe.test(moodStr)) scaleType = Math.random() > 0.5 ? 'mixolydian' : 'dorian';
    else if (resolveRe.test(moodStr)) scaleType = Math.random() > 0.5 ? 'dorian' : 'major';
  }

    // --- Better randomization with crypto-based seeding ---
    const crypto = await import('crypto');
    const videoHash = crypto.createHash('sha256').update(JSON.stringify(extraContext?.videoAnalysis?.segments||[])).digest();
    const timeComponent = Date.now() + Math.random() * 1000000;
    const seedBase = videoHash.readUInt32BE(0) ^ Math.floor(timeComponent);
    const seedVariant = (seedBase % 9973) + Math.floor(Math.random() * 1000);
    // Expanded tonic centers with more variety
    const majorRoots = [48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67]; // C3-G4 range
    const minorRoots = [45, 47, 48, 50, 52, 53, 55, 57, 58, 60, 62];     // A2-D4 range
    const pick = (arr:number[]) => arr[Math.floor(Math.random() * arr.length)];
    const chosenRoot = scaleType === 'major' ? pick(majorRoots) : scaleType === 'minor' ? pick(minorRoots) : pick([...majorRoots,...minorRoots]);
    const rootMidi = Math.min(72, Math.max(36, chosenRoot));
    const scaleIntervals: Record<string, number[]> = {
      major:      [0,2,4,5,7,9,11],
      minor:      [0,2,3,5,7,8,10],
      dorian:     [0,2,3,5,7,9,10],
      mixolydian: [0,2,4,5,7,9,10],
      lydian:     [0,2,4,6,7,9,11],
      phrygian:   [0,1,3,5,7,8,10]
    };
    const chosenScale = scaleIntervals[scaleType];
    const scaleSet = new Set(chosenScale);
  const clamp = (n:number)=>Math.min(96, Math.max(36, n));
    const nearestScaleNote = (m:number) => {
      const octave = Math.floor((m - rootMidi)/12);
      const within = ((m - rootMidi) % 12 + 12) % 12;
      if (scaleSet.has(within)) return clamp(rootMidi + octave*12 + within);
      let best = within, dist = 99;
      for (const iv of chosenScale) {
        const d = Math.abs(iv - within);
        if (d < dist) { dist = d; best = iv; }
      }
      return clamp(rootMidi + octave*12 + best);
    };

    // Intensity -> register bands
    interface Band { low:number; high:number; }
    const lowBand: Band = { low: 52, high: 60 };
    const midBand: Band = { low: 57, high: 69 };
    const highBand: Band = { low: 64, high: 76 };
    const pickBandForIntensity = (x:number): Band => x < 0.33 ? lowBand : (x < 0.66 ? midBand : highBand);

    let segmentIntensity = (_t:number) => 0.5;
    if (videoAnalysis?.segments?.length) {
      const segs = videoAnalysis.segments;
      segmentIntensity = (t:number) => {
        const seg = segs.find((s:any)=> t >= s.startMs && t < s.endMs) || segs[segs.length-1];
        return typeof seg.intensity === 'number' ? Math.min(1, Math.max(0, seg.intensity)) : 0.5;
      };
    }

  if (events.length) {
  const origPitches = events.map(e=>noteNameToMidi(e.noteName)!);
      const uniqueBefore = new Set(origPitches).size;
  const firstDur = events[0].duration;
  const uniformDuration = events.every(e=>e.duration === firstDur);

      events = events.map((e,i)=>{
        const intensity = segmentIntensity(e.time);
        const band = pickBandForIntensity(intensity);
        const bandCenter = (band.low + band.high)/2;
        let adjusted = noteNameToMidi(e.noteName)!;
        if (uniqueBefore <= 4) {
          const spread = (i % 5) - 2; // -2..2 pattern
            adjusted = Math.round(bandCenter + spread * 2 + (intensity-0.5)*8);
        } else {
          const baseMidi = noteNameToMidi(e.noteName)!;
          adjusted = Math.round((baseMidi*0.6) + (bandCenter*0.4) + (intensity-0.5)*6);
        }
        adjusted = nearestScaleNote(adjusted);
        // Early octave diversification: push some early events outward
        if (i < 6) {
          const diversifySeed = (seedVariant + i*17) % 5;
          if (diversifySeed === 0) adjusted = clamp(adjusted - 12);
          else if (diversifySeed === 1) adjusted = clamp(adjusted + 12);
        }
        if (i>=4) {
          const a = noteNameToMidi(events[i-4].noteName)!;
          const b = noteNameToMidi(events[i-3].noteName)!;
          const c = noteNameToMidi(events[i-2].noteName)!;
          const d = noteNameToMidi(events[i-1].noteName)!;
          if (a < b && b < c && c < d && d === adjusted) {
            adjusted = nearestScaleNote(adjusted + ((i % 2) ? -3 : 5));
          }
        }
  let dur = e.duration;
        if (uniformDuration) {
          if (i % 3 === 0) dur = Math.max(150, Math.round(dur * 0.55));
          if (i % 7 === 0) dur = Math.min(2000, Math.round(dur * 1.8));
        }
        return { ...e, noteName: midiToNoteName(adjusted), duration: dur };
      });

      // Post-adjust pitch diversity check
  const pitchVar = new Set(events.map(e=>e.noteName)).size;
  if (pitchVar < Math.min(8, Math.ceil(events.length/3))) {
  const injections: InternalEvent[] = [];
        for (let i=0; i<events.length && injections.length < 6; i+=Math.max(2, Math.floor(events.length/10))) {
          const e = events[i];
          const midi = noteNameToMidi(e.noteName)!;
          const within = ((midi - rootMidi) % 12 + 12) % 12;
          const idx = chosenScale.indexOf(within);
          if (idx >= 0) {
            const nextScaleIv = chosenScale[(idx+1) % chosenScale.length];
            const newNote = clamp(rootMidi + 12*Math.floor((midi-rootMidi)/12) + nextScaleIv);
            injections.push({
              noteName: midiToNoteName(newNote),
              time: e.time + Math.round(e.duration*0.5),
              duration: Math.max(150, Math.round(e.duration*0.4)),
              velocity: Math.min(110, (e.velocity ?? 80) + 8)
            });
          }
        }
        if (injections.length) {
          events = events.concat(injections).sort((a,b)=>a.time-b.time);
        }
      }
      // Mid-band compression mitigation: redistribute if >55% in C4-B4
      const midBand = events.filter(e=> { const m=noteNameToMidi(e.noteName)!; return m>=60 && m<=71; });
      if (midBand.length > events.length * 0.55) {
        let shifted = 0;
        for (let i=0;i<events.length;i++) {
          if (shifted >= 6) break;
          const m = noteNameToMidi(events[i].noteName)!;
          if (m>=60 && m<=71) {
            const dir = ((seedVariant + i*31) % 2) ? -12 : +12;
            const candidate = clamp(m + dir);
            if ((candidate < 60 || candidate > 71) && candidate >=36 && candidate <= 90) {
              events[i].noteName = midiToNoteName(candidate);
              shifted++;
            }
          }
        }
      }
    }
  } catch (variationErr) {
    console.warn('[gemini] variation enhancement failed', variationErr);
  }

  // --- Enrichment Phase: add rhythmic subdivision, harmonic layers, and fill tasteful gaps ---
  const enrichPlan = (evts: InternalEvent[], target: number): InternalEvent[] => {
    let list = [...evts].sort((a,b)=>a.time-b.time);
    const maxEvents = 80;
    // Better random number generator
  const rng = () => Math.random();

    // 1. Subdivide long notes
  const additions: InternalEvent[] = [];
    for (const e of list) {
      if (e.duration > 1100 && additions.length + list.length < maxEvents) {
        const midTime = e.time + Math.round(e.duration * 0.5);
        const shortDur = Math.max(180, Math.round(e.duration * 0.3));
        const midi = noteNameToMidi(e.noteName)!;
        additions.push({
          noteName: midiToNoteName(Math.min(96, Math.max(36, midi + (rng() > 0.5 ? 2 : -2)))),
            time: midTime,
          duration: shortDur,
          velocity: Math.min(110, (e.velocity ?? 80) + 5)
        });
      }
    }
    list = list.concat(additions);

    // 2. Fill large silent gaps with passing notes
    list.sort((a,b)=>a.time-b.time);
  const gapAdds: InternalEvent[] = [];
    for (let i=0;i<list.length-1;i++) {
      const cur = list[i];
      const next = list[i+1];
      const gapStart = cur.time + cur.duration;
      const gap = next.time - gapStart;
      if (gap > 600 && gapAdds.length + list.length < maxEvents) {
        const curMidi = noteNameToMidi(cur.noteName)!;
        gapAdds.push({
          noteName: midiToNoteName(Math.min(96, Math.max(36, curMidi + (rng() < 0.5 ? 5 : -3)))),
          time: gapStart + 120,
          duration: Math.min(400, gap - 200),
          velocity: Math.max(50, Math.min(100, (cur.velocity ?? 75) + 8))
        });
      }
    }
    list = list.concat(gapAdds);

    // 3. Add harmonic layer (every 4th event) with shorter duration
  const harmony: InternalEvent[] = [];
    for (let i=0;i<list.length && list.length + harmony.length < maxEvents;i+=4) {
      const e = list[i];
      const interval = rng() < 0.5 ? 4 : 7; // major third or perfect fifth
      const midi = noteNameToMidi(e.noteName)!;
      const hNote = midi + interval;
      if (hNote <= 84) {
        harmony.push({
          noteName: midiToNoteName(hNote),
          time: e.time + 10,
          duration: Math.max(150, Math.round(e.duration * 0.55)),
          velocity: Math.max(45, Math.min(100, (e.velocity ?? 80) - 5))
        });
      }
    }
    list = list.concat(harmony);

    // 4. Light velocity humanization
    list = list.map(e => ({
      ...e,
      velocity: Math.max(40, Math.min(110, (e.velocity ?? 80) + Math.round((rng()-0.5)*12)))
    }));

    // 5. Ensure sorted & prune overlaps beyond 2 simultaneous
  list.sort((a,b)=> a.time - b.time || (noteNameToMidi(a.noteName)! - noteNameToMidi(b.noteName)!));
  const pruned: InternalEvent[] = [];
    for (const e of list) {
    const overlapping = pruned.filter(p => !(p.time + p.duration <= e.time || e.time + e.duration <= p.time));
      if (overlapping.length >= 3) continue; // keep texture reasonable
      pruned.push(e);
      if (pruned.length >= maxEvents) break;
    }

    // 6. Scale again precisely after enrichment
    if (target && pruned.length) {
      const end = pruned.reduce((m,p)=>Math.max(m, p.time + p.duration), 0);
      if (end > 0) {
        const s = target / end;
        for (const p of pruned) {
          p.time = Math.round(p.time * s);
          p.duration = Math.max(120, Math.round(p.duration * s));
        }
      }
    }

    return pruned.sort((a,b)=>a.time-b.time);
  };

  events = enrichPlan(events, targetDurationMs);
  diagnostics.afterEnrichUnique = new Set(events.map(e=>e.noteName)).size;
  diagnostics.afterEnrichDistinctDurations = new Set(events.map(e=>e.duration)).size;

  // --- Pattern Breaker: detect simple repeating cycles (e.g., ascending sequence of 4 pitches looping) ---
  const pitches = events.map(e => noteNameToMidi(e.noteName)!);
  const cycleLen = 4;
  // Compare first two cycles
  if (pitches.length >= cycleLen * 2) {
    const first = pitches.slice(0, cycleLen).join(',');
    const second = pitches.slice(cycleLen, cycleLen * 2).join(',');
    if (first === second) {
      // Mutate second cycle: transpose some notes & randomize durations slightly
      for (let i = cycleLen; i < cycleLen * 2; i++) {
        const curMidi = noteNameToMidi(events[i].noteName)!;
  events[i].noteName = midiToNoteName(Math.min(96, Math.max(36, curMidi + ((i % 2 === 0) ? 3 : -2))));
  events[i].duration = Math.max(150, Math.min(2000, Math.round(events[i].duration * (0.7 + (i % 2 ? 0.25 : -0.1)))));
      }
    }
  }

  // Ensure minEvents requirement (add ornament passing notes if short)
  if (events.length < minEvents) {
    const needed = minEvents - events.length;
  const extra: InternalEvent[] = [];
    for (let i = 0; i < needed; i++) {
      const anchor = events[i % events.length];
      const t = anchor.time + Math.round((anchor.duration || 200) * 0.5);
      const anchorMidi = noteNameToMidi(anchor.noteName)!;
      extra.push({
  noteName: midiToNoteName(Math.min(96, Math.max(36, anchorMidi + ((i % 3) - 1) * 2))),
        time: t,
        duration: 180 + (i % 4) * 40,
        velocity: Math.max(50, Math.min(100, (anchor.velocity ?? 75) + ((i % 2) ? 6 : -4)))
      });
    }
    events = events.concat(extra).sort((a,b)=>a.time-b.time);
  }
  diagnostics.afterMotifUnique = new Set(events.map(e=>e.noteName)).size;
  diagnostics.afterMotifDistinctDurations = new Set(events.map(e=>e.duration)).size;

  // --- Diversity / Motif Layer ---
  try {
    const ctx = extraContext as any | undefined;
    const videoAnalysis = ctx?.videoAnalysis;
    const segments = (videoAnalysis?.segments || []).slice().sort((a:any,b:any)=>a.startMs-b.startMs);
    // Dynamically generate motif patterns with more variety
    const generateMotif = () => {
      const length = 3 + Math.floor(Math.random() * 4); // 3-6 notes
      const motif = [0]; // Always start from root
      for (let i = 1; i < length; i++) {
        const intervalChoices = [-7, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 7];
        motif.push(intervalChoices[Math.floor(Math.random() * intervalChoices.length)]);
      }
      return motif;
    };
    const motifPool: number[][] = Array.from({length: 8}, () => generateMotif());
    if (!segments.length) {
      // create synthetic segments to apply motifs across timeline quartiles
      const end = events.reduce((m,e)=>Math.max(m, e.time+e.duration),0);
      const q = end/4;
      segments.push({ startMs:0,endMs:q,intensity:0.3,mood:'calm',action:'part1' });
      segments.push({ startMs:q,endMs:2*q,intensity:0.5,mood:'build',action:'part2' });
      segments.push({ startMs:2*q,endMs:3*q,intensity:0.8,mood:'peak',action:'part3' });
      segments.push({ startMs:3*q,endMs:end,intensity:0.4,mood:'resolve',action:'part4' });
    }

    // Assign motif per segment deterministically by segment index.
    const segMotifs = new Map<any, number[]>();
    segments.forEach((seg:any, idx:number)=>{
      segMotifs.set(seg, motifPool[idx % motifPool.length]);
    });

    events.sort((a,b)=>a.time-b.time);
    // Apply motif shaping: for each segment, nudge pitches toward following the motif pattern.
    for (const seg of segments) {
      const motif = segMotifs.get(seg);
      if (!motif || !motif.length) continue;
      const segEvents = events.filter(e=> e.time >= seg.startMs && e.time < seg.endMs);
      if (segEvents.length < motif.length) continue;
  const anchor = noteNameToMidi(segEvents[0].noteName)!;
      for (let i=0;i<segEvents.length;i++) {
        const mInterval = motif[i % motif.length];
        if (i < motif.length * 2) {
          let target = anchor + mInterval + (Math.floor(i/motif.length)* ( (mInterval>0)?2:-2));
      const segMidi = noteNameToMidi(segEvents[i].noteName)!;
      const blended = Math.round((segMidi * 0.6) + (target * 0.4));
  segEvents[i].noteName = midiToNoteName(Math.min(96, Math.max(36, blended)));
        }
      }
    }

    // Pitch histogram balancing
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.noteName, (counts.get(e.noteName)||0)+1);
    const total = events.length;
    const maxPer = Math.ceil(total * 0.18); // no pitch should dominate above 18%
    // Gather underused candidate pitches (derive from existing notes +/- scale steps)
    const existing = Array.from(counts.keys());
    const candidatePool: number[] = [];
    for (const name of existing) {
      const midi = noteNameToMidi(name)!;
      for (const d of [-9,-7,-5,-4,-2,2,3,4,5,7,9]) {
        const c = midi + d;
        if (c>=48 && c<=84 && !candidatePool.includes(c)) candidatePool.push(c);
      }
    }
    let poolIdx = 0;
    for (const e of events) {
      const c = counts.get(e.noteName)!;
      if (c > maxPer && candidatePool.length) {
        const replacement = candidatePool[poolIdx % candidatePool.length];
        poolIdx++;
        counts.set(e.noteName, c-1);
        const replName = midiToNoteName(replacement);
        e.noteName = replName;
        counts.set(replName, (counts.get(replName)||0)+1);
      }
    }

    // Ensure some leaps (>5 semitones) exist
  const leaps = events.filter((e,i)=> i>0 && Math.abs(noteNameToMidi(e.noteName)! - noteNameToMidi(events[i-1].noteName)!) >= 6).length;
    if (leaps < Math.max(3, Math.round(total/20))) {
      for (let i=4;i<events.length && (events.filter((e,j)=> j>0 && Math.abs(noteNameToMidi(e.noteName)! - noteNameToMidi(events[j-1].noteName)!) >= 6).length < Math.max(3, Math.round(total/20))); i+=5) {
        const midi = noteNameToMidi(events[i].noteName)!;
  events[i].noteName = midiToNoteName(Math.min(96, Math.max(36, midi + ( (i%2)? +7 : -7 ))));
      }
    }

    // Micro timing jitter (avoid strict grid feel) excluding first and last 2 events
    for (let i=1;i<events.length-2;i++) {
      const jitter = ((i * 37) % 5) - 2; // -2..+2ms deterministic tiny jitter
      events[i].time = Math.max(0, events[i].time + jitter);
    }
    events.sort((a,b)=>a.time-b.time);
  } catch (divErr) {
    console.warn('[gemini] diversity layer failed', divErr);
  }

  // --- Deterministic Rhythmic Regeneration (if still monotonous) ---
  try {
    const ctx = extraContext as any | undefined;
    const videoAnalysis = ctx?.videoAnalysis;
  const uniquePitchCount = new Set(events.map(e=>e.noteName)).size;
    const distinctDurations = new Set(events.map(e=>e.duration)).size;
    const avgDuration = events.reduce((s,e)=>s+e.duration,0)/(events.length||1);
    const monotone = uniquePitchCount <= 4 && (distinctDurations <= 2 || avgDuration > 800);
    diagnostics.preRegenUnique = uniquePitchCount;
    diagnostics.preRegenDistinctDurations = distinctDurations;
    diagnostics.preRegenAvgDuration = +avgDuration.toFixed(2);
    if (monotone && videoAnalysis?.segments?.length) {
      const segs = videoAnalysis.segments;
      const totalDur = targetDurationMs || segs[segs.length-1].endMs || (events.reduce((m,e)=>Math.max(m,e.time+e.duration),0));
      const root = 60;
      const scale = [0,2,3,5,7,9,10]; // dorian as neutral base
      const pickNote = (base:number, octaveShift:number, step:number) => {
        const iv = scale[(step % scale.length + scale.length) % scale.length];
  return Math.min(96, Math.max(36, base + octaveShift*12 + iv));
      };
  const rebuilt: InternalEvent[] = [];
      let globalStep = 0;
      for (const seg of segs) {
        const segLen = seg.endMs - seg.startMs;
        const motion = seg.motionSpeed ?? Math.round(seg.intensity*8)+2;
        // events per second mapping
        const eps = 0.6 + motion * 0.55; // 1..~6.1
        const targetEvents = Math.max(2, Math.round(eps * (segLen/1000)));
        // duration range selection inverse to motion
        const chooseDuration = () => {
          const rand = Math.random();
          const baseOptions = motion >= 8 ? [125, 150, 187, 250] :
                             motion >= 6 ? [187, 250, 375, 500] :
                             motion >= 4 ? [375, 500, 750, 1000] :
                             motion >= 2 ? [750, 1000, 1500, 2000] :
                             [1000, 1500, 2000, 2500];
          const selected = baseOptions[Math.floor(rand * baseOptions.length)];
          // Add variation of ±20%
          return Math.round(selected * (0.8 + rand * 0.4));
        };
        let tCursor = seg.startMs;
        for (let i=0;i<targetEvents;i++) {
          const dur = chooseDuration();
          // keep inside segment; last event may spill slightly
          if (tCursor >= seg.endMs) break;
          const octaveShift = (motion >=8 ? 2 : motion >=6 ? 1 : motion <=2 ? -1 : 0);
          const note = pickNote(root + (seg.mood?.includes('peak')?2:0), octaveShift, globalStep + i + (motion>=7?i:0));
          rebuilt.push({
            noteName: midiToNoteName(note),
            time: Math.round(tCursor + Math.min(120, (globalStep*17 + i*31) % 90)),
            duration: Math.min(dur, seg.endMs - tCursor + 200),
            velocity: (()=>{
              const phase = (seg.startMs + (tCursor-seg.startMs)) / totalDur;
              if (phase < 0.15) return 60 + (motion%5)*4;
              if (phase < 0.55) return 72 + (motion%6)*5;
              if (phase < 0.80) return 90 + (motion%4)*5;
              return 70 + (motion%5)*4;
            })()
          });
          // advance cursor: for fast motion pack tighter
          const gapFactor = motion >=8 ? 0.35 : motion >=6 ? 0.55 : motion >=4 ? 0.8 : 1.25;
          tCursor += Math.max(120, Math.round(dur * gapFactor));
          globalStep++;
        }
        // Insert a deliberate rest gap in low motion segments
        if (motion <=3) globalStep += 2;
      }
      // Replace only if we achieved better diversity
  const newUnique = new Set(rebuilt.map(e=>e.noteName)).size;
      if (newUnique > uniquePitchCount && rebuilt.length > events.length * 0.8) {
        events = rebuilt.sort((a,b)=>a.time-b.time);
        diagnostics.rebuildApplied = true;
        diagnostics.rebuildNewUnique = newUnique;
      }
    }
  } catch (rhErr) {
    console.warn('[gemini] rhythmic regeneration failed', rhErr);
    diagnostics.rgError = (rhErr as any)?.message;
  }

  // Re-scale one final time to ensure final end alignment hasn't drifted
  if (targetDurationMs && events.length) {
    const end = events.reduce((m,e)=>Math.max(m, e.time + e.duration), 0);
    if (end > 0) {
      const scale = targetDurationMs / end;
      for (const e of events) {
        e.time = Math.round(e.time * scale);
        e.duration = Math.max(120, Math.round(e.duration * scale));
      }
    }
  }

  // Scale to target precisely
  if (targetDurationMs && events.length) {
    const end = events.reduce((m, e) => Math.max(m, e.time + e.duration), 0);
    if (end > 0) {
      const scale = targetDurationMs / end;
      events = events.map(e => ({
        ...e,
        time: Math.round(e.time * scale),
        duration: Math.round(e.duration * scale)
      }));
    }
    const finalEnd = events.reduce((m, e) => Math.max(m, e.time + e.duration), 0);
    if (finalEnd < targetDurationMs * 0.96) {
      // Add final sustaining chord
      events.push({
        noteName: 'C5',
        time: Math.max(0, targetDurationMs - 1800),
        duration: 1800,
        velocity: 75
      });
    }
  }

    // -------- Register Expansion & Density Enforcement --------
    try {
      if (events.length) {
        // 1. Ensure at least one event per second window (0-based) up to target duration (or last event end)
        const endMs = targetDurationMs || events.reduce((m,e)=>Math.max(m, e.time + e.duration), 0);
        const seconds = Math.max(1, Math.floor(endMs / 1000));
        const bySecond: boolean[] = new Array(seconds).fill(false);
        for (const ev of events) {
          const idx = Math.floor(ev.time / 1000);
          if (idx >=0 && idx < seconds) bySecond[idx] = true;
        }
        const filler: InternalEvent[] = [];
        let lastMidi = noteNameToMidi(events[0].noteName) || 60;
        for (let s=0; s<seconds; s++) {
          if (!bySecond[s]) {
            // Insert filler at s*1000 + 40ms
              // Alternate large/small interval to add motion and possible octave change
            const dir = (s % 4 === 0) ? 12 : ((s % 3 === 0) ? -12 : (s % 2 === 0 ? 7 : -5));
            let cand = lastMidi + dir;
            if (cand > 84) cand -= 12;
            if (cand < 48) cand += 12;
            lastMidi = cand;
            const noteName = midiToNoteName(cand);
            const noteType: NoteType = (s % 5 === 0) ? 'quarter' : 'eighth';
            const dur = noteType === 'eighth' ? 250 : 500;
            filler.push({
              noteName,
              time: s*1000 + 40,
              duration: dur,
              velocity: 68 + (s % 6) * 5
            });
          }
        }
        if (filler.length) {
          events = events.concat(filler).sort((a,b)=>a.time-b.time);
          (diagnostics as any).densityInserted = filler.length;
        }

        // 2. Register expansion: broaden range if compressed (< 12 semitones)
        const midis = events.map(e=> noteNameToMidi(e.noteName)!).filter(m=>m!=null);
        const minMidi = Math.min(...midis);
        const maxMidi = Math.max(...midis);
        if (maxMidi - minMidi < 12) {
          let expanded = 0;
          for (let i=0;i<events.length;i++) {
            if (expanded >= 8) break;
            if (i % 3 === 1) {
              // push up an octave if room
              let m = noteNameToMidi(events[i].noteName)! + 12;
              if (m <= 84) { events[i].noteName = midiToNoteName(m); expanded++; continue; }
            }
            if (i % 5 === 2) {
              // pull down an octave if room
              let m = noteNameToMidi(events[i].noteName)! - 12;
              if (m >= 48) { events[i].noteName = midiToNoteName(m); expanded++; continue; }
            }
          }
          if (expanded) (diagnostics as any).rangeExpandedBy = expanded;
        }
      }
    } catch (regErr) {
      (diagnostics as any).rangeDensityError = (regErr as any)?.message;
    }

  // -------- Continuous Coverage Enforcement (no silent gaps) --------
  try {
    if (events.length) {
      events.sort((a,b)=>a.time-b.time);
      const targetEnd = targetDurationMs || events.reduce((m,e)=>Math.max(m, e.time + e.duration),0);
      const MAX_NEW = 120; // safety cap
      let added: InternalEvent[] = [];
  const canonicalDurationsDesc = [2000,1000,500,250,125]; // descending with sixteenth
      const choosePitch = (anchor: InternalEvent | undefined, idx:number, prev?: InternalEvent, next?: InternalEvent) => {
        const a = anchor ? noteNameToMidi(anchor.noteName)! : 60;
        const p = prev ? noteNameToMidi(prev.noteName)! : a;
        const n = next ? noteNameToMidi(next.noteName)! : a;
        let avg = Math.round((p + n + a)/3 + ((idx%4)-1.5)*2);
        avg = Math.min(96, Math.max(36, avg));
        return midiToNoteName(avg);
      };

      const ensureGapFilled = (start:number, end:number, anchorPrev?: InternalEvent, anchorNext?: InternalEvent) => {
        let cursor = start;
        let localIdx = 0;
        while (cursor < end - 1 && added.length < MAX_NEW) {
          const remaining = end - cursor;
            // Pick largest canonical <= remaining; if none (remaining < 250) we extend last filler
          let dur = canonicalDurationsDesc.find(d => d <= remaining);
          if (!dur) {
            // adjust previous filler (if any) to cover tail remainder <250ms
            const last = added[added.length-1];
            if (last) last.duration += remaining; else dur = remaining; // fallback single tiny event
            break;
          }
          const pitch = choosePitch(anchorPrev, localIdx, anchorPrev, anchorNext);
          added.push({
            noteName: pitch,
            time: cursor,
            duration: dur,
            velocity: Math.min(110, Math.max(45, (anchorPrev?.velocity ?? 72) + ((localIdx%3)-1)*7))
          });
          cursor += dur;
          localIdx++;
        }
      };

      // Fill inter-event gaps
      for (let i=0;i<events.length-1;i++) {
        const cur = events[i];
        const next = events[i+1];
        const curEnd = cur.time + cur.duration;
        if (next.time > curEnd) {
          ensureGapFilled(curEnd, next.time, cur, next);
        }
      }
      // Final tail to targetEnd
      const lastEnd = events.reduce((m,e)=>Math.max(m, e.time + e.duration),0);
      if (targetEnd > lastEnd) ensureGapFilled(lastEnd, targetEnd, events[events.length-1], undefined);

      if (added.length) {
        events = events.concat(added).sort((a,b)=>a.time-b.time);
        (diagnostics as any).coverageAdded = added.length;
      }
    }
  } catch (coverageErr) {
    (diagnostics as any).coverageError = (coverageErr as any)?.message;
  }

  // Ensure noteName provided for client display
  // Map internal events to public symbolic-only events
  const toNoteType = (ms: number): NoteType => {
    if (ms < 190) return 'sixteenth';
    if (ms < 375) return 'eighth';
    if (ms < 750) return 'quarter';
    if (ms < 1500) return 'half';
    return 'whole';
  };
  const publicEvents: MusicalEvent[] = events.map(ev => {
    const nt = toNoteType(ev.duration);
    // snap duration to canonical for clarity (include sixteenth)
    const canonical = nt === 'sixteenth' ? 125 : nt === 'eighth' ? 250 : nt === 'quarter' ? 500 : nt === 'half' ? 1000 : 2000;
    return {
      noteName: ev.noteName,
      time: ev.time,
      duration: canonical,
      noteType: nt,
      velocity: ev.velocity
    };
  });
  
  // Post-process register breadth injection: ensure low (<=G3) & high (>=A5) representation for clips >=5s
  try {
    const endMs = targetDurationMs || publicEvents.reduce((m,e)=>Math.max(m, e.time + e.duration),0);
    if (endMs >= 5000) {
      const lows = publicEvents.filter(e=> noteNameToMidi(e.noteName)! <= 55);
      const highs = publicEvents.filter(e=> noteNameToMidi(e.noteName)! >= 81);
      let needLow = Math.max(0, 4 - lows.length);
      let needHigh = Math.max(0, 4 - highs.length);
      if (needLow || needHigh) {
        const anchors = publicEvents.slice().sort((a,b)=>a.time-b.time);
        const additions: MusicalEvent[] = [];
        for (let i=0; i<needLow; i++) {
          const src = anchors[(i*2) % anchors.length];
          const base = noteNameToMidi(src.noteName)!;
            const target = Math.max(36, Math.min(55, base - 24 + (i%4)*2));
          additions.push({
            noteName: midiToNoteName(target),
            time: src.time + 15,
            duration: 250,
            noteType: 'eighth',
            velocity: Math.min(100, (src.velocity ?? 78) + 4)
          });
        }
        for (let i=0; i<needHigh; i++) {
          const src = anchors[(i*3 + 1) % anchors.length];
          const base = noteNameToMidi(src.noteName)!;
            const target = Math.min(96, Math.max(81, base + 24 - (i%3)*3));
          additions.push({
            noteName: midiToNoteName(target),
            time: src.time + 30,
            duration: 125,
            noteType: 'sixteenth',
            velocity: Math.min(108, (src.velocity ?? 82) + 6)
          });
        }
        if (additions.length) {
          (publicEvents as any).push(...additions);
          (publicEvents as any).sort((a:MusicalEvent,b:MusicalEvent)=>a.time-b.time);
        }
      }
    }
  } catch {}
  return { events: publicEvents, diagnostics } as any;
}

// --- Video analysis (structure the video into segments we can map to musical intensity) ---
export async function requestVideoAnalysis(
  apiKey: string,
  fileUri: string,
  mimeType: string,
  targetDurationMs: number
): Promise<VideoAnalysis> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: ANALYSIS_MODEL });

  const analysisPrompt = `Analyze the attached video and produce a concise structured JSON object.
Goal: Provide segments we can map to musical intensity + mood.
Rules:
1. Return ONLY JSON with keys: durationMs, segments (array), notes (optional string).
2. segments: each { startMs, endMs, intensity (0..1), mood (1-2 words), action (<= 8 words), motion_speed (1-10), motion (short verb phrase) }.
3. 6-14 segments total (fewer for very short clips, more for longer), covering entire 0..duration with no gaps and no overlaps.
4. Intensity heuristic: camera or subject motion, number of entities, apparent tension or impact.
5. Ensure startMs = 0 for first; final segment endMs within ±1% of durationMs (${targetDurationMs}).
6. Keep moods varied if the visuals change (e.g., calm, building, tense, explosive, resolve).
7. Use chronological ordering.
8. motion_speed: 1 = static / almost no movement, 5 = moderate movement, 10 = extremely fast / frantic action.
If unsure about exact duration, assume durationMs = ${targetDurationMs}.
JSON ONLY.`;

  let response;
  try {
    response = await model.generateContent({
      contents: [
        { role: 'user', parts: [ { fileData: { fileUri, mimeType } }, { text: analysisPrompt } ] }
      ],
      generationConfig: { temperature: 0.4, maxOutputTokens: 1024 }
    });
  } catch (err) {
    console.warn('[gemini][analysis] primary attempt failed, retry without strictness', err);
    response = await model.generateContent({
      contents: [ { role: 'user', parts: [ { fileData: { fileUri, mimeType } }, { text: analysisPrompt } ] } ],
      generationConfig: { temperature: 0.6 }
    });
  }

  const text = (response as any)?.response?.text?.() || '';
  let jsonStr = text.trim();
  if (!jsonStr.startsWith('{')) {
    const match = jsonStr.match(/\{[\s\S]*\}/);
    if (match) jsonStr = match[0];
  }
  let parsed: any = {};
  try { parsed = JSON.parse(jsonStr); } catch {}

  let segments: VideoSegment[] = Array.isArray(parsed.segments) ? parsed.segments : [];
  segments = segments.filter(s => typeof s.startMs === 'number' && typeof s.endMs === 'number' && s.endMs > s.startMs)
    .map(s => ({
      startMs: Math.max(0, Math.round(s.startMs)),
      endMs: Math.max(1, Math.round(s.endMs)),
      intensity: Math.min(1, Math.max(0, Number(s.intensity) || 0.5)),
      mood: String(s.mood || 'neutral').slice(0, 24),
      action: String(s.action || 'action').slice(0, 48),
      motionSpeed: Math.min(10, Math.max(1, Math.round(Number((s as any).motion_speed) || Math.round((Number(s.intensity)||0.5)*8)+1 )))
    }))
    .sort((a,b)=>a.startMs-b.startMs);

  // Fallback if empty
  if (!segments.length) {
    const total = targetDurationMs || 8000;
    const segCount = 8;
    const segLen = total / segCount;
    segments = Array.from({ length: segCount }).map((_, i) => ({
      startMs: Math.round(i * segLen),
      endMs: Math.round((i+1) * segLen),
      intensity: +(0.3 + 0.7 * (i / (segCount-1))).toFixed(2),
      mood: i < segCount/3 ? 'calm' : i < (2*segCount/3) ? 'building' : 'peak',
      action: 'segment ' + (i+1)
    }));
  }

  // Merge / normalize overlaps & gaps
  segments.sort((a,b)=>a.startMs-b.startMs);
  for (let i=0; i<segments.length-1; i++) {
    if (segments[i].endMs > segments[i+1].startMs) {
      // small overlap -> trim
      if (segments[i].endMs - segments[i+1].startMs < 400) {
        segments[i].endMs = segments[i+1].startMs;
      }
    }
    if (segments[i].endMs < segments[i+1].startMs) {
      // gap -> stretch prior
      const gap = segments[i+1].startMs - segments[i].endMs;
      if (gap < 600) segments[i].endMs += gap;
    }
  }

  const durationMs = targetDurationMs || segments.reduce((m,s)=>Math.max(m, s.endMs), 0);
  if (segments[0].startMs !== 0) segments[0].startMs = 0;
  const last = segments[segments.length-1];
  if (last.endMs < durationMs * 0.97) last.endMs = durationMs;

  return { durationMs, segments, notes: parsed.notes };
}

// --------- Frame-by-frame analysis (one frame per second) ---------
export interface FrameAnalysis {
  timeMs: number;
  description: string;
  tags: string[];
  mood?: string;
  primaryAction?: string;
  motionLevel?: number; // 1-10
}

/**
 * Extracts one frame per second using ffmpeg and runs Gemini vision model on each frame.
 * Returns an ordered list of frame analyses.
 * NOTE: For long videos this can be expensive; limit via maxSeconds.
 */
export async function analyzeVideoFrames(
  apiKey: string,
  videoTempPath: string,
  opts: { maxSeconds?: number; modelOverride?: string } = {}
): Promise<FrameAnalysis[]> {
  const { maxSeconds = 120, modelOverride } = opts;
  const fs = await import('fs');
  const os = await import('os');
  const path = await import('path');
  const ffmpegMod = await import('fluent-ffmpeg');
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'frames-'));
  // Extract frames at 1 fps (naming frame-%04d.jpg)
  const extracted: string[] = await new Promise((resolve, reject) => {
    const outFiles: string[] = [];
    ffmpegMod.default(videoTempPath)
      .outputOptions(['-vf', 'fps=1'])
      .output(path.join(tmpDir, 'frame-%06d.jpg'))
      .on('error', reject)
      .on('end', async () => {
        const files = (await fs.promises.readdir(tmpDir))
          .filter(f => f.startsWith('frame-') && f.endsWith('.jpg'))
          .sort();
        resolve(files.map(f => path.join(tmpDir, f)));
      })
      .run();
  });

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelOverride || ANALYSIS_MODEL });

  const framesToUse = extracted.slice(0, maxSeconds); // treat index as seconds
  const analyses: FrameAnalysis[] = [];
  for (let i = 0; i < framesToUse.length; i++) {
    const filePath = framesToUse[i];
    const data = await fs.promises.readFile(filePath);
    const b64 = data.toString('base64');
    const timeMs = i * 1000;
    const prompt = `Analyze this single video frame captured at t=${timeMs}ms.
Return JSON ONLY: {"timeMs": number, "description": string (1-3 vivid sentences), "tags": string[], "mood": string, "primaryAction": string, "motionLevel": 1-10}.
Focus on visible motion, subjects, mood adjectives, and action verbs.
JSON only.`;
    try {
      const resp = await model.generateContent({
        contents: [
          { role: 'user', parts: [
            { inlineData: { data: b64, mimeType: 'image/jpeg' } },
            { text: prompt }
          ]}
        ],
        generationConfig: { temperature: 0.4, maxOutputTokens: 256 }
      });
      const text = (resp as any)?.response?.text?.() || '';
      let jsonStr = text.trim();
      if (!jsonStr.startsWith('{')) {
        const m = jsonStr.match(/\{[\s\S]*\}/); if (m) jsonStr = m[0];
      }
      let parsed: any = {};
      try { parsed = JSON.parse(jsonStr); } catch {}
      analyses.push({
        timeMs,
        description: String(parsed.description || parsed.desc || '').slice(0, 500),
        tags: Array.isArray(parsed.tags) ? parsed.tags.map((t:any)=>String(t).slice(0,32)) : [],
        mood: parsed.mood ? String(parsed.mood).slice(0,40) : undefined,
        primaryAction: parsed.primaryAction ? String(parsed.primaryAction).slice(0,60) : undefined,
        motionLevel: typeof parsed.motionLevel === 'number' ? Math.min(10, Math.max(1, Math.round(parsed.motionLevel))) : undefined
      });
    } catch (err) {
      analyses.push({ timeMs, description: 'analysis_error', tags: [], mood: undefined, primaryAction: undefined, motionLevel: undefined });
    }
  }

  // Cleanup frames
  try { for (const f of extracted) await fs.promises.unlink(f); await fs.promises.rmdir(tmpDir); } catch {}
  return analyses;
}
