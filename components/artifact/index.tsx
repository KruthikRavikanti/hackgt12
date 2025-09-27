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
import { CheckIcon, ClipboardIcon, PlayIcon, XIcon } from "lucide-react";
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
              className="w-full h-full flex flex-col justify-start items-stretch  rounded-lg overflow-auto"
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
      </CardFooter>
    </Card>
  );
};

export default ArtifactPanel;
