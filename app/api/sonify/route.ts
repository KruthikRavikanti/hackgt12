import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import MidiWriter from 'midi-writer-js';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { uploadVideoFile, requestMusicalPlan, requestVideoAnalysis, NoteType as GeminiNoteType } from '@/lib/gemini';

// NoteType mapping must mirror lib/gemini.ts
// Mirror (and now reuse) the NoteType including sixteenth from lib/gemini
type NoteType = GeminiNoteType;
const NOTE_TYPE_MS: Record<NoteType, number> = {
  sixteenth: 125,
  eighth: 250,
  quarter: 500,
  half: 1000,
  whole: 2000
};

// --- Pitch helpers (symbolic <-> MIDI) ---
const PITCH_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
function noteNameToMidiLoose(name: string): number | null {
  const m = name.match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
  if (!m) return null;
  let [, ltr, acc, octStr] = m;
  ltr = ltr.toUpperCase();
  const base: Record<string, number> = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
  let pc = base[ltr];
  if (pc == null) return null;
  if (acc === '#') pc += 1; else if (acc === 'b') pc -= 1;
  pc = (pc + 12) % 12;
  const octave = parseInt(octStr, 10);
  return 12 * (octave + 1) + pc;
}
function midiToNoteName(m: number): string {
  const n = Math.max(0, Math.min(127, Math.round(m)));
  const pc = n % 12;
  const octave = Math.floor(n / 12) - 1;
  return `${PITCH_NAMES[pc]}${octave}`;
}

// Infer canonical noteType from an arbitrary duration
function inferNoteType(duration: number): NoteType {
  if (duration < 375) return 'eighth';
  if (duration < 750) return 'quarter';
  if (duration < 1500) return 'half';
  return 'whole';
}

// Fill gaps >200ms by inserting a median pitch event covering the entire gap.
interface ScaleContext { rootPc: number; mode: 'major' | 'minor'; scalePcs: Set<number>; rootName: string; }

// Detect scale (major/minor) from existing events & optional mood cues.
function detectScale(events: { noteName: string }[], videoAnalysis: any): ScaleContext | null {
  if (!events.length) return null;
  // Collect pitch class histogram
  const counts = new Array(12).fill(0);
  const pcs: number[] = [];
  for (const e of events) {
    const m = noteNameToMidiLoose(e.noteName);
    if (m != null) { const pc = ((m % 12)+12)%12; counts[pc]++; pcs.push(pc); }
  }
  if (!pcs.length) return null;
  const total = pcs.length;
  const majorScale = (r:number)=> [0,2,4,5,7,9,11].map(iv=> (iv + r)%12);
  const minorScale = (r:number)=> [0,2,3,5,7,8,10].map(iv=> (iv + r)%12);
  let best: {score:number; rootPc:number; mode:'major'|'minor'; scale:number[]} | null = null;
  for (let r=0;r<12;r++) {
    for (const mode of ['major','minor'] as const) {
      const scale = mode==='major'?majorScale(r):minorScale(r);
      let score = 0;
      for (const pc of scale) score += counts[pc];
      // Penalize notes outside scale
      const outside = total - score;
      score -= outside * 0.35; // light penalty
      if (!best || score > best.score) best = { score, rootPc: r, mode, scale };
    }
  }
  // Mood override heuristics
  const moodWords = (videoAnalysis?.segments||[]).map((s:any)=>String(s.mood||'').toLowerCase());
  const moodStr = moodWords.join(' ');
  const positive = /(happy|bright|celebrat|excite|uplift|triumph|joy|energetic|crowd)/.test(moodStr);
  const negative = /(sad|tense|dark|melanch|somber|pressure|intense|defeat|loss)/.test(moodStr);
  if (best) {
    if (positive && !negative) {
      // ensure major preference: if chosen minor but major alt close in score, switch
      const alt = majorScale(best.rootPc);
      const altScore = alt.reduce((s,pc)=>s+counts[pc],0) - ((total - alt.reduce((s,pc)=>s+counts[pc],0))*0.35);
      if (best.mode==='minor' && altScore >= best.score - 1) best = { score: altScore, rootPc: best.rootPc, mode:'major', scale: alt };
    } else if (negative && !positive) {
      const alt = minorScale(best.rootPc);
      const altScore = alt.reduce((s,pc)=>s+counts[pc],0) - ((total - alt.reduce((s,pc)=>s+counts[pc],0))*0.35);
      if (best.mode==='major' && altScore >= best.score - 1) best = { score: altScore, rootPc: best.rootPc, mode:'minor', scale: alt };
    }
  }
  if (!best) return null;
  const pcNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  return { rootPc: best.rootPc, mode: best.mode, scalePcs: new Set(best.scale), rootName: pcNames[best.rootPc] };
}

// Map a midi pitch to nearest scale tone (stay close to original pitch)
function snapToScale(midi:number, scale: ScaleContext): number {
  const pc = ((midi % 12)+12)%12;
  if (scale.scalePcs.has(pc)) return midi;
  for (let dist=1; dist<=6; dist++) {
    for (const dir of [-1,1]) {
      const cand = pc + dir*dist;
      const norm = (cand+12)%12;
      if (scale.scalePcs.has(norm)) return midi + dir*dist;
    }
  }
  return midi; // fallback
}

function fillGapsWithMedian(events: { noteName: string; time: number; duration?: number; noteType: NoteType; velocity?: number }[], scale?: ScaleContext | null): { noteName: string; time: number; duration?: number; noteType: NoteType; velocity?: number }[] {
  if (!Array.isArray(events) || events.length < 2) return events;
  const sorted = [...events].sort((a,b)=>a.time-b.time);
  const augmented = [...sorted];
  let inserted = 0;
  for (let i=0;i<sorted.length-1;i++) {
    const cur = sorted[i];
    const next = sorted[i+1];
    const curDur = typeof cur.duration === 'number' ? cur.duration : NOTE_TYPE_MS[cur.noteType];
    const gapStart = cur.time + curDur;
    const gap = next.time - gapStart;
    if (gap > 200) {
      const prevMidi = noteNameToMidiLoose(cur.noteName);
      const nextMidi = noteNameToMidiLoose(next.noteName);
      if (prevMidi != null && nextMidi != null) {
        let median = Math.round((prevMidi + nextMidi)/2);
        if (scale) median = snapToScale(median, scale);
        const fillerDur = gap; // cover entire silent gap
        const fillerNoteName = midiToNoteName(median);
        const noteType = inferNoteType(fillerDur);
        augmented.push({
          noteName: fillerNoteName,
            time: gapStart,
          duration: fillerDur,
          noteType,
          velocity: Math.round(((cur.velocity ?? 75) + (next.velocity ?? 75))/2)
        });
        inserted++;
      }
    }
  }
  if (inserted) {
    console.log(`[sonify] Gap fill inserted ${inserted} median events (>200ms gaps).`);
  }
  return augmented.sort((a,b)=>a.time-b.time);
}

// --- Types ---
// Internal synthesis event (numeric MIDI) derived from symbolic plan
interface MusicalPlanEvent {
  note: number;      // MIDI note number (48-84)
  time: number;      // start time ms
  duration: number;  // duration ms
  velocity?: number; // 0-127
}

// --- Simple MIDI creation ---
function createMidiFile(plan: { events: MusicalPlanEvent[] }): Buffer {
  const track = new MidiWriter.Track();
  track.setTempo(120); // arbitrary
  // Convert ms to ticks (approx) using 500ms per beat at 120bpm -> 1 beat = 500ms
  const msPerBeat = 500;
  const toPitch = (midiNumber: number) => {
    // MidiWriter-js accepts note names like C4. Implement a simple mapping.
    const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const n = Math.max(0, Math.min(127, Math.round(midiNumber)));
    const octave = Math.floor(n / 12) - 1; // MIDI standard
    const name = names[n % 12];
    return `${name}${octave}`;
  };
  plan.events
    .sort((a, b) => a.time - b.time)
    .forEach(evt => {
      const startBeats = evt.time / msPerBeat;
      // Duration to beats, minimum 0.125
      const durBeats = Math.max(0.125, evt.duration / msPerBeat);
      track.addEvent(new MidiWriter.NoteEvent({
        pitch: [toPitch(evt.note)],
        velocity: evt.velocity ? Math.min(100, Math.max(10, Math.round(evt.velocity / 1.27))) : 70,
        wait: startBeats === 0 ? 0 : `T${Math.round(startBeats * 128)}`,
        duration: `T${Math.round(durBeats * 128)}`
      }));
    });
  const write = new MidiWriter.Writer([track]);
  return Buffer.from(write.buildFile());
}

// --- Enhanced WAV synthesis with harmonics ---
function synthesizePlanToWavBase64(plan: { events: MusicalPlanEvent[] }, targetDuration?: number): string {
  const sampleRate = 44100;
  const endMs = Math.max(
    targetDuration || 0,
    ...plan.events.map(e => e.time + e.duration)
  );
  const totalSamples = Math.max(1, Math.ceil((endMs / 1000) * sampleRate));
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  for (const evt of plan.events) {
    const freq = 440 * Math.pow(2, (evt.note - 69) / 12);
    const start = Math.floor((evt.time / 1000) * sampleRate);
    const durSamples = Math.floor((evt.duration / 1000) * sampleRate);
    const vel = (evt.velocity ?? 80) / 127;

    // Add some variation to the waveform based on note pitch
    const waveformMix = (evt.note % 12) / 12; // 0-1 based on pitch class
    const harmonicStrength = 0.3 + waveformMix * 0.4;

    for (let i = 0; i < durSamples; i++) {
      const idx = start + i;
      if (idx >= totalSamples) break;

      // More complex envelope with variable attack based on velocity
      const attackTime = Math.max(50, 150 - vel * 100);
      const releaseTime = Math.max(100, 300 - vel * 150);
      const env = i < attackTime ? i / attackTime :
                  i > durSamples - releaseTime ? Math.max(0, (durSamples - i) / releaseTime) : 1;

      // Mix sine with harmonics for richer sound
      const fundamental = Math.sin((2 * Math.PI * freq * i) / sampleRate);
      const harmonic2 = Math.sin((2 * Math.PI * freq * 2 * i) / sampleRate) * harmonicStrength * 0.5;
      const harmonic3 = Math.sin((2 * Math.PI * freq * 3 * i) / sampleRate) * harmonicStrength * 0.3;

      // Add subtle vibrato for longer notes
      const vibrato = evt.duration > 500 ? Math.sin((2 * Math.PI * 5 * i) / sampleRate) * 0.01 : 0;
      const sample = (fundamental + harmonic2 + harmonic3) * vel * 0.35 * env * (1 + vibrato);

      // Stereo positioning based on pitch
      const pan = 0.5 + (evt.note - 60) / 48; // pan based on pitch height
      left[idx] += sample * Math.sqrt(1 - pan);
      right[idx] += sample * Math.sqrt(pan);
    }
  }

  // Clamp / normalize
  let peak = 0;
  for (let i = 0; i < totalSamples; i++) {
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }
  const norm = peak > 1 ? 1 / peak : 1;
  // Interleave 16-bit little-endian
  const wavBuffer = new ArrayBuffer(44 + totalSamples * 4);
  const view = new DataView(wavBuffer);
  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + totalSamples * 4, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true);  // audio format = PCM
  view.setUint16(22, 2, true);  // channels
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true); // byte rate
  view.setUint16(32, 4, true);  // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, 'data');
  view.setUint32(40, totalSamples * 4, true);
  let offset = 44;
  for (let i = 0; i < totalSamples; i++) {
    const l = Math.max(-1, Math.min(1, left[i] * norm));
    const r = Math.max(-1, Math.min(1, right[i] * norm));
    view.setInt16(offset, l * 32767, true); offset += 2;
    view.setInt16(offset, r * 32767, true); offset += 2;
  }
  const b64 = Buffer.from(wavBuffer).toString('base64');
  return `data:audio/wav;base64,${b64}`;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const videoFile = formData.get('video') as File | null;
    if (!videoFile) return NextResponse.json({ error: 'No video file provided' }, { status: 400 });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing GEMINI_API_KEY on server' }, { status: 500 });
    }
  const durationMsStr = formData.get('durationMs');
  let targetDuration = typeof durationMsStr === 'string' ? parseInt(durationMsStr, 10) || undefined : undefined;

    // Persist uploaded file to a temporary location for Gemini File API
    const arrayBuf = await videoFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    console.log('[sonify] Incoming video bytes:', buffer.length);
    const tmpDir = os.tmpdir();
    const tempId = uuidv4();
    const tempVideoPath = path.join(tmpDir, `${tempId}.mp4`);
    await fs.writeFile(tempVideoPath, buffer);
    console.log('[sonify] Saved temp video:', tempVideoPath);

    let uploadedFileMeta: any = null;
  let musicalPlan: { events: { noteName: string; time: number; duration?: number; noteType: NoteType; velocity?: number }[] } = { events: [] };
  let detectedScaleInfo: any = null;
    // Debug snapshots
    let rawPlanBeforeGapFill: any = null;
    let gapFilledPlanSnapshot: any = null;
    let planEnd = 0;
    let videoAnalysis: any = null; // Structured segment analysis
    let fallbackUsed = false;
    let fallbackReason: string | undefined;
    try {
      uploadedFileMeta = await uploadVideoFile({ apiKey, videoTempPath: tempVideoPath, displayName: 'user-upload' });
      console.log('[sonify] Uploaded file URI:', uploadedFileMeta?.uri);

      // NEW: request structured video analysis first
      videoAnalysis = await requestVideoAnalysis(apiKey, uploadedFileMeta.uri, uploadedFileMeta.mimeType || 'video/mp4', targetDuration || 0);
      console.log('[sonify] Video analysis segments:', videoAnalysis?.segments?.length);

      if (!targetDuration && videoAnalysis?.durationMs) {
        targetDuration = videoAnalysis.durationMs;
      }

      // First attempt
      musicalPlan = await requestMusicalPlan(
        apiKey,
        uploadedFileMeta.uri,
        uploadedFileMeta.mimeType || 'video/mp4',
        targetDuration || (videoAnalysis?.durationMs) || 0,
        { videoAnalysis }
      );
      // Detect scale before gap fill so fillers stay inside scale
  const detectedScale = detectScale(musicalPlan.events, videoAnalysis);
  detectedScaleInfo = detectedScale ? { root: detectedScale.rootName, mode: detectedScale.mode } : null;
      rawPlanBeforeGapFill = { events: JSON.parse(JSON.stringify(musicalPlan.events)) };
      // Intermediary processing: fill gaps >200ms with median pitch event (snapshot after)
      musicalPlan.events = fillGapsWithMedian(musicalPlan.events, detectedScale);
      gapFilledPlanSnapshot = { events: JSON.parse(JSON.stringify(musicalPlan.events)) };
      planEnd = musicalPlan.events.reduce((m,e)=>{
        const dur = typeof e.duration === 'number' ? e.duration : NOTE_TYPE_MS[e.noteType];
        return Math.max(m, e.time + dur);
      }, 0);
      console.log('[sonify] Structured musical plan events:', musicalPlan.events.length, 'planEnd:', planEnd, 'target:', targetDuration);

      // Monotony / duration heuristics: retry once with refinement prompt if needed
  const uniqueNotes = new Set(musicalPlan.events.map(e=>e.noteName)).size;
  const uniformNoteType = musicalPlan.events.every(e=>e.noteType === musicalPlan.events[0]?.noteType);
      const tooShort = targetDuration && planEnd < targetDuration * 0.85;
      const repetitive = musicalPlan.events.length >= 8 && uniqueNotes <= 4 && uniformNoteType;
      if (repetitive || tooShort) {
        console.log('[sonify] Triggering refinement retry. Repetitive?', repetitive, 'tooShort?', tooShort);
        const refinementContext = {
          videoAnalysis,
          previousPlanStats: {
            eventCount: musicalPlan.events.length,
            uniqueNotes,
            uniformNoteType,
            planEnd,
            targetDuration
          },
          refinementDirectives: {
            requireMinPitchVar: 7,
            requireMixedDurations: true,
            amplifyIntensityMapping: true
          }
        };
        musicalPlan = await requestMusicalPlan(
          apiKey,
          uploadedFileMeta.uri,
          uploadedFileMeta.mimeType || 'video/mp4',
          targetDuration || (videoAnalysis?.durationMs) || 0,
          refinementContext
        );
        rawPlanBeforeGapFill = rawPlanBeforeGapFill || { events: [] }; // keep original first attempt if exists
        // Re-apply gap fill and snapshot (override previous snapshot since we will use refined plan)
  const detectedScaleRefined = detectScale(musicalPlan.events, videoAnalysis);
  detectedScaleInfo = detectedScaleRefined ? { root: detectedScaleRefined.rootName, mode: detectedScaleRefined.mode } : detectedScaleInfo;
  musicalPlan.events = fillGapsWithMedian(musicalPlan.events, detectedScaleRefined);
        gapFilledPlanSnapshot = { events: JSON.parse(JSON.stringify(musicalPlan.events)) };
        planEnd = musicalPlan.events.reduce((m,e)=>Math.max(m, e.time + (typeof e.duration === 'number' ? e.duration : NOTE_TYPE_MS[e.noteType])), 0);
        console.log('[sonify] Post-refinement events:', musicalPlan.events.length, 'planEnd:', planEnd);
      }
    } catch (sdkErr) {
      console.error('[sonify] Gemini structured flow failed, using fallback scaffold.', sdkErr);
      fallbackUsed = true;
      fallbackReason = (sdkErr as any)?.message || 'unknown-error';
      // Dynamic fallback with more variety
      const base = targetDuration || 8000;
      const numEvents = 16 + Math.floor(Math.random() * 8); // 16-24 events
      const step = base / numEvents;

      // Generate random scale
      const roots = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
      const root = roots[Math.floor(Math.random() * roots.length)];
      const octaves = [3, 4, 5];
      const scalePattern = Math.random() > 0.5 ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10]; // major or minor

      musicalPlan = { events: Array.from({ length: numEvents }).map((_, i) => {
        const octave = octaves[Math.floor(Math.random() * octaves.length)];
        const noteTypes: NoteType[] = ['sixteenth', 'eighth', 'quarter', 'half', 'whole'];
        const noteType = noteTypes[Math.floor(Math.random() * noteTypes.length)];

        return {
          noteName: `${root}${octave}`,
          time: Math.round(i * step + Math.random() * 50 - 25), // add timing jitter
          noteType: noteType,
          duration: NOTE_TYPE_MS[noteType],
          velocity: 60 + Math.floor(Math.random() * 40)
        };
      }) };
      planEnd = musicalPlan.events.reduce((m,e)=>Math.max(m, e.time + (e.duration ?? NOTE_TYPE_MS[e.noteType])), 0);
      rawPlanBeforeGapFill = { events: JSON.parse(JSON.stringify(musicalPlan.events)) };
  const detectedScaleFallback = detectScale(musicalPlan.events, videoAnalysis);
  detectedScaleInfo = detectedScaleFallback ? { root: detectedScaleFallback.rootName, mode: detectedScaleFallback.mode } : null;
  musicalPlan.events = fillGapsWithMedian(musicalPlan.events, detectedScaleFallback);
      gapFilledPlanSnapshot = { events: JSON.parse(JSON.stringify(musicalPlan.events)) };
    } finally {
      // Cleanup temp file
      fs.unlink(tempVideoPath).catch(()=>{});
    }

    // Scale plan to exact target duration if provided
    if (targetDuration && planEnd > 0) {
      const scale = targetDuration / planEnd;
      // We scale times only; keep noteType categories (durations implied). Optionally stretch category mapping but keep discrete.
      musicalPlan.events = musicalPlan.events.map(e => ({
        ...e,
        time: Math.round(e.time * scale)
      }));
      planEnd = musicalPlan.events.reduce((m,e)=>Math.max(m, e.time + (e.duration ?? NOTE_TYPE_MS[e.noteType])), 0);
      if (planEnd < targetDuration * 0.92) {
        // Append a sustaining whole note near end if short.
        musicalPlan.events.push({
          noteName: 'C5',
          time: Math.max(0, targetDuration - NOTE_TYPE_MS.whole),
          noteType: 'whole',
          duration: NOTE_TYPE_MS.whole,
          velocity: 80
        });
        planEnd = musicalPlan.events.reduce((m,e)=>Math.max(m, e.time + (e.duration ?? NOTE_TYPE_MS[e.noteType])), 0);
      }
    }

    // MIDI + audio synthesis: convert symbolic noteName -> MIDI
    const noteNameToMidi = (name: string): number => {
      const m = name.match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
      if (!m) return 60;
      let [, ltr, acc, octStr] = m;
      ltr = ltr.toUpperCase();
      const base: Record<string, number> = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
      let pc = base[ltr] ?? 0;
      if (acc === '#') pc += 1; else if (acc === 'b') pc -= 1;
      const octave = parseInt(octStr, 10);
      return Math.min(84, Math.max(48, 12 * (octave + 1) + ((pc+12)%12)));
    };
    const internalEvents: MusicalPlanEvent[] = musicalPlan.events.map(e => {
      const dur = typeof e.duration === 'number' ? e.duration : NOTE_TYPE_MS[e.noteType];
      return {
        note: noteNameToMidi(e.noteName),
        time: e.time,
        duration: dur,
        velocity: e.velocity
      };
    });
    const midiBuffer = createMidiFile({ events: internalEvents });
    console.log('[sonify] MIDI bytes:', midiBuffer.length);
    const audioUrl = synthesizePlanToWavBase64({ events: internalEvents }, targetDuration);

    // Convert to symbolic-only for response
  const symbolicPlan = { events: musicalPlan.events };

    return NextResponse.json({
      success: true,
      audioUrl,
      videoAnalysis,
      musicalPlan: symbolicPlan,
      rawPlanBeforeGapFill,
  gapFilledPlan: gapFilledPlanSnapshot,
  detectedScale: detectedScaleInfo,
      message: 'Video sonification completed successfully',
      targetDurationMs: targetDuration,
      planEndMs: planEnd,
      fileUri: uploadedFileMeta?.uri,
      fallbackUsed,
      fallbackReason
    });
  } catch (error) {
    console.error('Error in sonify API root catch:', error);
    return NextResponse.json({ error: 'Internal server error during video processing', detail: (error as any)?.message }, { status: 500 });
  }
}

// Notes:
// - Audio synthesis here is intentionally simple (sine waves) for portability.
// - Replace with a proper soundfont / sampler or external service for production quality.
// - Gemini file upload + structured JSON plan handled in lib/gemini.ts.
