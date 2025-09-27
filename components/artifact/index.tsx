"use client";

import React, { useState, useEffect, useRef } from "react";
import ABCJS from "abcjs";
import type { ReactArtifact } from "@/components/artifact/react";
import { CodeBlock } from "@/components/markdown/code-block";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { ArtifactMessagePartData } from "@/lib/utils";
import { CheckIcon, ClipboardIcon, PlayIcon, DownloadIcon, XIcon } from "lucide-react";
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
      console.error("An error occurred during audio playback: ", error);
    }
  };

  const handleDownloadMIDI = () => {
    try {
      if (!savedContent || savedContent.trim() === '') {
        alert("No ABC notation content to export.");
        return;
      }

      console.log("ABC Content for MIDI:", savedContent);

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
      console.log("Visual object keys:", Object.keys(visualObj || {}));

      // Generate MIDI using abcjs with proper MIDI format
      let midiBuffer;
      
      try {
        console.log("Generating MIDI from visual object...");
        
        // Use the correct abcjs MIDI generation approach
        if (typeof ABCJS.synth.getMidiFile === 'function') {
          // Try with visual object first
          midiBuffer = ABCJS.synth.getMidiFile(visualObj, {
            midiOutputType: "binary",
            midiTransposition: 0
          });
        } else if (typeof ABCJS.midi !== 'undefined' && typeof ABCJS.midi.sequence2midi === 'function') {
          // Alternative approach using ABCJS.midi
          midiBuffer = ABCJS.midi.sequence2midi(visualObj);
        } else {
          // Try to create MIDI using synthesis approach
          const midiSequence = ABCJS.synth.CreateSynth();
          if (midiSequence && typeof midiSequence.getMidiFile === 'function') {
            midiBuffer = midiSequence.getMidiFile(visualObj);
          }
        }
        
        console.log("MIDI buffer type:", typeof midiBuffer);
        console.log("MIDI buffer length:", midiBuffer?.length);
        console.log("MIDI buffer first few bytes:", midiBuffer ? Array.from(midiBuffer.slice(0, 10)) : 'null');
        
        if (!midiBuffer) {
          throw new Error("No MIDI data generated");
        }
        
        // Ensure we have a proper Uint8Array for MIDI
        if (typeof midiBuffer === 'string') {
          // Convert string to Uint8Array
          const encoder = new TextEncoder();
          midiBuffer = encoder.encode(midiBuffer);
        } else if (midiBuffer instanceof ArrayBuffer) {
          midiBuffer = new Uint8Array(midiBuffer);
        } else if (!midiBuffer instanceof Uint8Array) {
          midiBuffer = new Uint8Array(midiBuffer);
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
      console.log("MIDI header check:", midiBuffer.slice(0, 4));

      // Verify MIDI header (should start with "MThd")
      const expectedHeader = [0x4D, 0x54, 0x68, 0x64]; // "MThd" in hex
      const actualHeader = Array.from(midiBuffer.slice(0, 4));
      console.log("Expected MIDI header:", expectedHeader);
      console.log("Actual MIDI header:", actualHeader);

      if (!expectedHeader.every((byte, index) => byte === actualHeader[index])) {
        console.warn("MIDI header mismatch - file may not be valid MIDI format");
        alert("Generated MIDI file may not be in correct format. The ABC notation might not be fully compatible with MIDI export.");
        return;
      }

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

      console.log("MIDI file downloaded successfully:", filename);
    } catch (error) {
      console.error("An error occurred during MIDI export: ", error);
      alert("Failed to export MIDI file. Please check the ABC notation format.");
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
