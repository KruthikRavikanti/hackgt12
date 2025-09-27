import { Button } from "@/components/ui/button";
import { useEnterSubmit } from "@/lib/hooks/use-enter-submit";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CircleStopIcon,
  Loader2Icon,
  MicIcon,
  PaperclipIcon,
  PauseIcon,
  UploadIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Textarea from "react-textarea-autosize";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Attachment, Models } from "@/app/types";
import { getSettings, updateSettings } from "@/lib/userSettings";
import { AttachmentPreviewButton } from "@/components/chat/attachment-preview-button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui";
import { convertFileToBase64 } from "@/lib/utils";
import MidiParser from "midi-parser-js";

export type Props = {
  input: string;
  setInput: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  recording: boolean;
  onStartRecord: () => void;
  onStopRecord: () => void;
  attachments: Attachment[];
  onRemoveAttachment: (attachment: Attachment) => void;
  onAddAttachment: (newAttachments: Attachment[]) => void;
  showScrollButton: boolean;
  handleManualScroll: () => void;
  stopGenerating: () => void;
};

export const ChatInput = ({
  input,
  setInput,
  onSubmit,
  isLoading,
  recording,
  onStartRecord,
  onStopRecord,
  attachments,
  onRemoveAttachment,
  onAddAttachment,
  showScrollButton,
  handleManualScroll,
  stopGenerating,
}: Props) => {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { onKeyDown } = useEnterSubmit({ onSubmit });
  const [model, setModel] = useState<Models>(getSettings().model);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const midiInputRef = useRef<HTMLInputElement>(null);

  // Handle file upload button click
  const handleFileUpload = () => {
    fileInputRef.current?.click();
  };

  // Handle file selection and conversion to base64
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      const newAttachments = await Promise.all(
        filesArray.map(async (file) => ({
          url: await convertFileToBase64(file),
          name: file.name,
          contentType: file.type,
        }))
      );
      onAddAttachment(newAttachments);
    }
  };

  // Focus on input field when component mounts
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle model change and update settings
  const handleModelChange = (newModel: Models) => {
    setModel(newModel);
    updateSettings({ ...getSettings(), model: newModel });
  };

  // Handle MIDI upload button click
  const handleMidiUpload = () => {
    midiInputRef.current?.click();
  };

  // Handle MIDI file selection and conversion to ABC notation
  const handleMidiChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.mid') && !file.name.toLowerCase().endsWith('.midi')) {
      alert('Please select a MIDI file (.mid or .midi)');
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const midiData = new Uint8Array(arrayBuffer);
      
      // Convert MIDI to ABC notation
      const abcNotation = convertMidiToAbc(midiData, file.name);
      
      if (abcNotation) {
        // Set the converted ABC notation as input with a request message
        const message = `Please help me work on this musical composition. Here's the ABC notation I converted from a MIDI file:\n\n${abcNotation}`;
        setInput(message);
      } else {
        alert('Could not convert MIDI file to ABC notation.');
      }
    } catch (error) {
      console.error('Error processing MIDI file:', error);
      alert('Error processing MIDI file. Please try a different file.');
    }

    // Reset file input
    if (e.target) {
      e.target.value = '';
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
    <div className="sticky bottom-0 mx-auto w-full pt-6 flex flex-col gap-4 items-center">
      {showScrollButton && (
        <Button
          onClick={handleManualScroll}
          variant="outline"
          size="icon"
          className="rounded-full shadow-lg w-8 h-8"
        >
          <ArrowDownIcon className="h-4 w-4" />
        </Button>
      )}

      <div className="w-full flex flex-col gap-1 bg-[#F4F4F4] p-2.5 pl-4 rounded-2xl border border-b-0 rounded-b-none shadow-md">
        {/* Attachment preview */}
        {attachments && (
          <div className="flex items-center gap-2 mb-2">
            {attachments.map((attachment, index) => (
              <AttachmentPreviewButton
                key={index}
                value={attachment}
                onRemove={onRemoveAttachment}
              />
            ))}
          </div>
        )}

    <div className="flex gap-2 items-start">
          {/* Main input textarea */}
          <Textarea
            ref={inputRef}
            tabIndex={0}
            onKeyDown={onKeyDown}
            placeholder="Message Duet."
            className="min-h-15 max-h-96 overflow-auto w-full bg-transparent border-none resize-none focus-within:outline-none"
            autoFocus
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            name="message"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />

          {/* Hidden file inputs */}
          <input
            type="file"
            accept="image/*"
            multiple
            ref={fileInputRef}
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          <input
            type="file"
            accept=".mid,.midi"
            ref={midiInputRef}
            style={{ display: "none" }}
            onChange={handleMidiChange}
          />

          {/* File upload button */}
          <Button
            variant="outline"
            size="icon"
            className="w-10 h-8 bg-transparent rounded-2xl"
            onClick={handleFileUpload}
            title="Upload image"
          >
            <PaperclipIcon className="w-4 h-4" />
          </Button>

          {/* MIDI upload button */}
          <Button
            variant="outline"
            size="icon"
            className="w-10 h-8 bg-transparent rounded-2xl"
            onClick={handleMidiUpload}
            title="Upload MIDI file"
          >
            <UploadIcon className="w-4 h-4" />
          </Button>

          {/* Voice recording button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => (recording ? onStopRecord() : onStartRecord())}
                  size="icon"
                  variant="outline"
                  className="w-10 h-8 bg-transparent disabled:pointer-events-auto rounded-2xl"
                >
                  {recording ? (
                    <PauseIcon className="w-4 h-4" />
                  ) : (
                    <MicIcon className="w-4 h-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {getSettings().openaiApiKey
                    ? "Click to record voice and crop artifacts for editing"
                    : "Missing OpenAI API Key in Settings for Speech to Text"}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Submit button */}
          <Button
            onClick={isLoading ? stopGenerating : onSubmit}
            size="icon"
            className="w-10 h-8 rounded-2xl"
          >
            {isLoading ? (
              <CircleStopIcon className="w-4 h-4" />
            ) : (
              <ArrowUpIcon className="w-4 h-4" />
            )}
          </Button>
        </div>

        {/* Model selection dropdown */}
        <Select value={model || undefined} onValueChange={handleModelChange}>
          <SelectTrigger className="w-fit bg-[#F4F4F4] flex items-center gap-2 border-none">
            <SelectValue placeholder="Select Model" />
          </SelectTrigger>
          <SelectContent className="w-fit">
          <SelectItem value={Models.gpt4o}>Duet</SelectItem>
          <SelectItem value={Models.gpt4oMini}>GPT-4o Mini</SelectItem>
          <SelectItem value={Models.gpt4turbo}>GPT-4 Turbo</SelectItem>
          <SelectItem value={Models.gpt35turbo}>GPT-3.5 Turbo</SelectItem>

          </SelectContent>
        </Select>
      </div>
    </div>
  );
};
