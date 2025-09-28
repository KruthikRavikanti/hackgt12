"use client";

import React, { useState, useEffect, useRef } from "react";
import ABCJS from "abcjs";
import type { ReactArtifact } from "@/components/artifact/react";
import { CodeBlock } from "@/components/markdown/code-block";
import { Button } from "@/components/ui/button";
import MidiParser from "midi-parser-js";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { ArtifactMessagePartData } from "@/lib/utils";
import { CheckIcon, ClipboardIcon, PlayIcon, DownloadIcon, UploadIcon, XIcon } from "lucide-react";
import ABCNotationRenderer from "@/components/ui/ABCNotationRenderer";

type Props = {
  onClose: () => void;
  recording: boolean;
  onCapture: typeof ReactArtifact.prototype.onCapture;
  generating: boolean;
} & ArtifactMessagePartData;

export type ArtifactMode = "editor" | "preview";

const ArtifactPanel: React.FC<Props> = ({
  type,
  title = "Untitled",
  language,
  content,
  onClose,
  recording,
  onCapture,
  generating,
}) => {
  const [mode, setMode] = useState<ArtifactMode>("preview");
  const [editableContent, setEditableContent] = useState(content);
  const [savedContent, setSavedContent] = useState(content);
  const { isCopied, copyToClipboard } = useCopyToClipboard({ timeout: 2000 });
  const synthRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    setEditableContent(content);
    setSavedContent(content);
  }, [content]);

  const onCopy = () => {
    if (isCopied) return;
    copyToClipboard(editableContent);
  };

  const handleSaveChanges = () => {
    setSavedContent(editableContent);
  };

  const handlePlayAudio = async () => {
    try {
      if (!ABCJS.synth.supportsAudio()) {
        alert("Audio is not supported in this browser.");
        return;
      }

      if (synthRef.current && audioContextRef.current?.state === "running") {
        synthRef.current?.stop();
        return;
      }

      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
      }
      synthRef.current = new ABCJS.synth.CreateSynth() as any;

      const visualObj = ABCJS.renderAbc("abc-notation", savedContent, {
        add_classes: true,
      })[0];

      await synthRef.current?.init({
        visualObj,
        audioContext: audioContextRef.current,
        millisecondsPerMeasure: undefined,
        options: {
          soundFontUrl: "https://paulrosen.github.io/midi-js-soundfonts/abcjs/",
        },
      });

      await synthRef.current?.prime();
      synthRef.current?.start();
    } catch (error) {
      console.error("An error occurred during audio playbook: ", error);
    }
  };

  const handleDownloadMIDI = () => {
    try {
      if (!savedContent || savedContent.trim() === '') {
        alert("No ABC notation content to export.");
        return;
      }

      console.log("ABC Content for MIDI:", savedContent);

      // Extract MIDI metadata from ABC comments
      const midiMetadata = extractMidiMetadata(savedContent);
      console.log("Extracted MIDI metadata:", midiMetadata);

      // Create a temporary div element for parsing
      const tempDiv = document.createElement('div');
      tempDiv.id = 'temp-midi-export';
      document.body.appendChild(tempDiv);

      let visualObjs;
      try {
        // Parse the ABC notation using the temporary div
        visualObjs = ABCJS.renderAbc(tempDiv, savedContent, {
          add_classes: true,
        });
        console.log("Visual objects array:", visualObjs);
        console.log("Array length:", visualObjs?.length);
      } catch (parseError) {
        console.error("ABC parsing error:", parseError);
        document.body.removeChild(tempDiv);
        alert("Invalid ABC notation format. Please check your composition.");
        return;
      } finally {
        // Clean up the temporary div
        if (tempDiv.parentNode) {
          document.body.removeChild(tempDiv);
        }
      }

      if (!visualObjs || visualObjs.length === 0) {
        alert("Unable to parse ABC notation for MIDI export.");
        return;
      }

      const visualObj = visualObjs[0];
      console.log("Selected visual object:", visualObj);

      // Generate enhanced MIDI using metadata
      let midiBuffer;
      
      try {
        console.log("Generating enhanced MIDI with metadata...");
        
        // Use enhanced MIDI generation with metadata
        midiBuffer = generateEnhancedMidi(visualObj, midiMetadata, savedContent);
        
        console.log("MIDI buffer type:", typeof midiBuffer);
        console.log("MIDI buffer length:", midiBuffer?.length);
        
        if (!midiBuffer) {
          throw new Error("No MIDI data generated");
        }
        
      } catch (midiError) {
        console.error("MIDI generation error:", midiError);
        alert("Unable to generate MIDI data. MIDI export may not be supported for this ABC notation.");
        return;
      }

      if (!midiBuffer || midiBuffer.length === 0) {
        alert("Unable to generate MIDI data from ABC notation.");
        return;
      }

      console.log("Final MIDI buffer:", midiBuffer);

      // Create blob and download
      const blob = new Blob([midiBuffer], { type: "audio/midi" });
      
      // Generate filename from title or use default
      const filename = title 
        ? `${title.replace(/[^a-z0-9\s]/gi, '_').replace(/\s+/g, '_').toLowerCase()}.mid`
        : 'composition.mid';
      
      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      console.log("Enhanced MIDI file downloaded successfully:", filename);
    } catch (error) {
      console.error("An error occurred during MIDI export: ", error);
      alert("Failed to export MIDI file. Please check the ABC notation format.");
    }
  };

  // Extract MIDI metadata from ABC comments
  const extractMidiMetadata = (abcContent: string) => {
    const metadata: any = {
      tracks: [],
      division: 480,
      format: 1,
      velocities: {},
      instruments: {}
    };

    const lines = abcContent.split('\n');
    let currentTrackIndex = -1;

    for (const line of lines) {
      const trimmedLine = line.trim();
      
      if (trimmedLine.startsWith('% MIDI_DIVISION:')) {
        metadata.division = parseInt(trimmedLine.split(':')[1]) || 480;
      } else if (trimmedLine.startsWith('% MIDI_FORMAT:')) {
        metadata.format = parseInt(trimmedLine.split(':')[1]) || 1;
      } else if (trimmedLine.startsWith('% TRACK_')) {
        const match = trimmedLine.match(/% TRACK_(\d+)_(\w+):\s*(.+)/);
        if (match) {
          const trackIndex = parseInt(match[1]);
          const property = match[2];
          const value = match[3];

          if (!metadata.tracks[trackIndex]) {
            metadata.tracks[trackIndex] = {};
          }

          if (property === 'INSTRUMENT') {
            metadata.tracks[trackIndex].instrument = parseInt(value) || 0;
          } else if (property === 'CHANNEL') {
            metadata.tracks[trackIndex].channel = parseInt(value) || 0;
          } else if (property === 'NAME') {
            metadata.tracks[trackIndex].name = value;
          }
        }
      } else if (trimmedLine.includes('% vel:')) {
        // Extract inline velocity comments
        const velMatch = trimmedLine.match(/% vel:(\d+)/);
        if (velMatch) {
          const velocity = parseInt(velMatch[1]);
          // Store velocity for the preceding note (simplified approach)
          metadata.velocities[Object.keys(metadata.velocities).length] = velocity;
        }
      }
    }

    return metadata;
  };

  // Generate enhanced MIDI with metadata
  const generateEnhancedMidi = (visualObj: any, metadata: any, abcContent: string): Uint8Array => {
    try {
      // First, generate basic MIDI using abcjs
      let midiBuffer;
      
      if (typeof ABCJS.synth.getMidiFile === 'function') {
        midiBuffer = ABCJS.synth.getMidiFile(visualObj, {
          midiOutputType: "binary"
        });
      } else {
        throw new Error("ABCJS MIDI generation not available");
      }

      // Ensure we have a proper Uint8Array
      if (typeof midiBuffer === 'string') {
        const encoder = new TextEncoder();
        midiBuffer = encoder.encode(midiBuffer);
      } else if (midiBuffer instanceof ArrayBuffer) {
        midiBuffer = new Uint8Array(midiBuffer);
      } else if (!(midiBuffer instanceof Uint8Array)) {
        midiBuffer = new Uint8Array(midiBuffer);
      }

      // For now, return the basic MIDI (in future versions, we could enhance this
      // by parsing the MIDI and modifying velocity/instrument data)
      console.log("Generated MIDI with metadata awareness");
      
      // TODO: Future enhancement - modify MIDI bytes to apply:
      // - metadata.velocities for note velocity changes
      // - metadata.tracks[].instrument for program changes
      // - metadata.tracks[].channel for channel assignments
      
      return midiBuffer;
    } catch (error) {
      console.error("Enhanced MIDI generation failed:", error);
      throw error;
    }
  };

  // Advanced MIDI to ABC conversion function using midi-parser-js
  const convertMidiToAbc = (midiData: Uint8Array, filename: string): string => {
    try {
      // Parse MIDI file using midi-parser-js
      const midiJson = MidiParser.parse(midiData);
      console.log('Parsed MIDI:', midiJson);

      const baseName = filename.replace(/\.[^/.]+$/, "");
      
      // Extract key signature and time signature
      let keySignature = 'C'; // Default
      let timeSignature = '4/4'; // Default
      let tempo = 120; // Default BPM
      
      // Look for time and key signature events in all tracks
      for (const track of midiJson.track) {
        for (const event of track.event) {
          if (event.metaType === 88) { // Time signature
            const numerator = event.data[0];
            const denominator = Math.pow(2, event.data[1]);
            timeSignature = `${numerator}/${denominator}`;
          } else if (event.metaType === 89) { // Key signature
            const sharpsFlats = event.data[0];
            const major = event.data[1] === 0; // 0 = major, 1 = minor
            keySignature = getKeyFromSignature(sharpsFlats, major);
          } else if (event.metaType === 81) { // Tempo
            const microsecondsPerQuarter = (event.data[0] << 16) | (event.data[1] << 8) | event.data[2];
            tempo = Math.round(60000000 / microsecondsPerQuarter);
          }
        }
      }

      // Convert notes to ABC notation
      const notes = extractNotesFromMidi(midiJson, timeSignature);
      
      // Create ABC notation
      let abc = `X:1\nT:${baseName}\nM:${timeSignature}\nL:1/8\nK:${keySignature}\nQ:${tempo}\n`;
      abc += `% Converted from MIDI: ${filename}\n`;
      
      if (notes.length > 0) {
        abc += notes.join(' ') + ' |';
      } else {
        abc += '% No notes found - please add your melody here\nC D E F |';
      }
      
      return abc;
    } catch (error) {
      console.error('MIDI conversion error:', error);
      
      // Fallback to basic template
      const baseName = filename.replace(/\.[^/.]+$/, "");
      return `X:1\nT:${baseName}\nM:4/4\nL:1/4\nK:C\n% Error converting MIDI file: ${filename}\n% Please edit this ABC notation manually\nC D E F | G A B c |\n`;
    }
  };

  // Helper function to convert key signature to ABC key
  const getKeyFromSignature = (sharpsFlats: number, major: boolean): string => {
    const majorKeys = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];
    const minorKeys = ['Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'D#m', 'A#m', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm', 'Abm'];
    
    // Handle sharps (positive) and flats (negative)
    let keyIndex = 0;
    if (sharpsFlats >= 0 && sharpsFlats <= 7) {
      keyIndex = sharpsFlats;
    } else if (sharpsFlats < 0 && sharpsFlats >= -7) {
      keyIndex = 8 + Math.abs(sharpsFlats);
    }
    
    return major ? majorKeys[keyIndex] || 'C' : minorKeys[keyIndex] || 'Am';
  };

  // Helper function to extract notes from MIDI and convert to ABC
  const extractNotesFromMidi = (midiJson: any, timeSignature: string): string[] => {
    const notes: string[] = [];
    const noteMap: { [key: number]: string } = {
      60: 'C', 61: '^C', 62: 'D', 63: '^D', 64: 'E', 65: 'F', 
      66: '^F', 67: 'G', 68: '^G', 69: 'A', 70: '^A', 71: 'B'
    };
    
    try {
      // Find the track with the most note events (usually the melody)
      let mainTrack = null;
      let maxNotes = 0;
      
      for (const track of midiJson.track) {
        const noteCount = track.event.filter((e: any) => e.type === 9 && e.data[1] > 0).length;
        if (noteCount > maxNotes) {
          maxNotes = noteCount;
          mainTrack = track;
        }
      }
      
      if (!mainTrack || maxNotes === 0) return [];
      
      // Extract note on events
      const noteEvents = mainTrack.event
        .filter((e: any) => e.type === 9 && e.data[1] > 0) // Note on events with velocity > 0
        .slice(0, 32) // Limit to first 32 notes to avoid overly long sequences
        .map((e: any) => {
          const noteNumber = e.data[0];
          const octave = Math.floor(noteNumber / 12) - 1;
          const noteInOctave = noteNumber % 12;
          
          // Convert to ABC notation
          let noteName = noteMap[60 + noteInOctave] || 'C';
          
          // Handle octaves
          if (octave >= 5) {
            noteName = noteName.toLowerCase();
            if (octave > 5) {
              noteName += "'".repeat(octave - 5);
            }
          } else if (octave < 4) {
            noteName += ",".repeat(4 - octave);
          }
          
          return noteName;
        });
      
      return noteEvents;
    } catch (error) {
      console.error('Note extraction error:', error);
      return [];
    }
  };

  return (
    <Card className="w-full border-none rounded-none flex flex-col h-full max-h-full">
      <CardHeader className="bg-slate-50 rounded-lg border rounded-b-none py-2 px-6 flex flex-row items-center gap-4 justify-between space-y-0">
        <span className="font-semibold text-xl">
          {title || "Generating..."}
        </span>
        <div className="flex gap-2 items-center">
          <Tabs
            value={mode}
            onValueChange={(value) => setMode(value as ArtifactMode)}
          >
            <TabsList className="bg-slate-200">
              <TabsTrigger value="preview">Preview</TabsTrigger>
              <TabsTrigger value="editor">Editor</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button onClick={onClose} size="icon" variant="ghost">
            <XIcon className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent
        id="artifact-content"
        className="border-l border-r p-4 w-full flex-1 max-h-full overflow-hidden relative"
      >
        <Tabs value={mode}>
          <TabsContent value="preview">
            <div
              id="abc-notation"
              className="w-full h-full flex flex-col justify-start items-stretch rounded-lg overflow-x-auto overflow-y-auto"
            >
              <ABCNotationRenderer abcNotation={savedContent} />
            </div>
          </TabsContent>
          <TabsContent value="editor">
            <div className="w-full h-full flex flex-col justify-center items-center p-6  rounded-lg">
              <div className="w-full">
                <CodeBlock
                  language="abc"
                  value={editableContent}
                  showHeader={true}
                  className="overflow-auto"
                  onChange={(newContent) => setEditableContent(newContent)}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>

      <CardFooter className="bg-slate-50 border rounded-lg rounded-t-none py-2 px-6 flex items-center flex-row-reverse gap-4">
        <Button
          onClick={onCopy}
          size="icon"
          variant="outline"
          className="w-8 h-8"
        >
          {isCopied ? (
            <CheckIcon className="w-4 h-4" />
          ) : (
            <ClipboardIcon className="w-4 h-4" />
          )}
        </Button>
        <Button
          onClick={handleSaveChanges}
          className="bg-gray-100 text-black hover:bg-gray-200 shadow-sm"
        >
          Save
        </Button>
        <Button
          id="play-button"
          onClick={handlePlayAudio}
          size="icon"
          variant="outline"
          className="w-8 h-8"
        >
          <PlayIcon className="w-4 h-4" />
        </Button>
        <Button
          id="download-midi-button"
          onClick={handleDownloadMIDI}
          size="icon"
          variant="outline"
          className="w-8 h-8"
          title="Download as MIDI"
        >
          <DownloadIcon className="w-4 h-4" />
        </Button>
      </CardFooter>
    </Card>
  );
};

export default ArtifactPanel;
