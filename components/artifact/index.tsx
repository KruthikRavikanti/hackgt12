"use client";

import React, { useState, useEffect, useRef } from "react";
import * as ABCJS from "abcjs";
import type { ReactArtifact } from "@/components/artifact/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { ArtifactMessagePartData } from "@/lib/utils";
import { CheckIcon, ClipboardIcon, PlayIcon, DownloadIcon, XIcon, Square } from "lucide-react";
import InteractiveMusicEditor from "@/components/ui/InteractiveMusicEditor";

type Props = {
  onClose: () => void;
  generating: boolean;
} & ArtifactMessagePartData;

const ArtifactPanel: React.FC<Props> = ({
  title = "Untitled",
  content,
  onClose,
  generating,
}) => {
  const [savedContent, setSavedContent] = useState(content);
  const [isPlaying, setIsPlaying] = useState(false);
  const { isCopied, copyToClipboard } = useCopyToClipboard({ timeout: 2000 });
  const synthRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const visualObjRef = useRef<any>(null);
  const timingCallbacksRef = useRef<any>(null);
  const currentNoteElementsRef = useRef<Element[]>([]);

  useEffect(() => {
    setSavedContent(content);
  }, [content]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (synthRef.current) {
        try {
          synthRef.current.stop();
        } catch (e) {
          console.log('Cleanup error:', e);
        }
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        try {
          audioContextRef.current.close();
        } catch (e) {
          console.log('Audio context cleanup error:', e);
        }
      }
    };
  }, []);

  const onCopy = () => {
    if (isCopied) return;
    copyToClipboard(savedContent);
  };

  const handlePlayAudio = async () => {
    try {
      // Check audio support
      if (!ABCJS.synth.supportsAudio()) {
        alert("Audio is not supported in this browser.");
        return;
      }

      // If currently playing, stop
      if (isPlaying && synthRef.current) {
        try {
          synthRef.current.stop();
        } catch (e) {
          console.log('Error stopping:', e);
        }
        // Stop timing callbacks
        if (timingCallbacksRef.current) {
          try {
            if (timingCallbacksRef.current.stop) {
              timingCallbacksRef.current.stop();
            }
            if (timingCallbacksRef.current.pause) {
              timingCallbacksRef.current.pause();
            }
          } catch (e) {
            console.log('Error stopping timing callbacks:', e);
          }
          timingCallbacksRef.current = null;
        }
        // Clear all highlights
        currentNoteElementsRef.current.forEach(elem => {
          elem.classList.remove('abcjs-highlight', 'playing');
          if (elem instanceof SVGElement) {
            elem.style.fill = '';
            elem.style.stroke = '';
            elem.style.transition = '';
          }
        });
        currentNoteElementsRef.current = [];
        setIsPlaying(false);
        synthRef.current = null;
        return;
      }

      // Clean up any existing synth
      if (synthRef.current) {
        try {
          synthRef.current.stop();
        } catch (e) {
          console.log('Cleanup error:', e);
        }
        synthRef.current = null;
      }

      console.log('Starting playback with content:', savedContent);

      // Get the visual object from the current rendering
      let visualObj = null;

      // First try to get it from the editor's rendering
      const editorContainer = document.querySelector('#artifact-content');
      if (editorContainer) {
        // Re-render to get fresh visual object with timing info
        const renderContainer = editorContainer.querySelector('div[data-abc-container="true"]') ||
                               editorContainer.querySelector('.abcjs-container')?.parentElement ||
                               editorContainer;

        // Clear and re-render for timing
        const tempContainer = document.createElement('div');
        tempContainer.style.visibility = 'hidden';
        tempContainer.style.position = 'absolute';
        document.body.appendChild(tempContainer);

        try {
          const renderResult = ABCJS.renderAbc(tempContainer, savedContent, {
            add_classes: true,
            clickListener: false,
            staffwidth: 800
          });
          visualObj = renderResult[0];
        } catch (e) {
          console.error('Render error:', e);
        } finally {
          if (tempContainer.parentNode) {
            document.body.removeChild(tempContainer);
          }
        }
      }

      if (!visualObj) {
        console.error('Failed to parse ABC notation');
        alert("Unable to parse the music notation. Please check that the ABC notation is valid.");
        return;
      }

      console.log('Visual object created:', visualObj);

      // Create audio context if needed
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      // Resume if suspended
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      // Create the synth
      synthRef.current = new ABCJS.synth.CreateSynth();

      // Setup visualization with proper highlighting
      const setupVisualization = () => {
        try {
          const visibleContainer = document.querySelector('#artifact-content [data-abc-container="true"]');
          if (!visibleContainer) {
            console.log('No visible ABC container found for visualization');
            return;
          }

          const svg = visibleContainer.querySelector('svg');
          if (!svg) {
            console.log('No SVG element found');
            return;
          }

          console.log('Setting up note highlighting visualization');

          // Clear existing highlights
          currentNoteElementsRef.current.forEach(elem => {
            elem.classList.remove('abcjs-highlight', 'playing');
            if (elem instanceof SVGElement || elem instanceof HTMLElement) {
              (elem as any).style.fill = '';
              (elem as any).style.stroke = '';
            }
          });
          currentNoteElementsRef.current = [];

          // Use TimingCallbacks if available and we have a visual object
          if (visualObj && (ABCJS as any).TimingCallbacks) {
            console.log('Using ABCJS TimingCallbacks');

            try {
              const timingCallbacks = new (ABCJS as any).TimingCallbacks(visualObj, {
                eventCallback: function(event: any) {
                  if (!event) return;

                  // Clear previous highlights
                  currentNoteElementsRef.current.forEach(elem => {
                    elem.classList.remove('abcjs-highlight', 'playing');
                  });
                  currentNoteElementsRef.current = [];

                  // Highlight new elements - try multiple ways to find them
                  if (event.elements) {
                    event.elements.forEach((element: any) => {
                      // Try different ways to get the elements
                      let elementsToHighlight: any[] = [];

                      if (element.abselem?.elemset) {
                        elementsToHighlight = element.abselem.elemset;
                      } else if (element.elements) {
                        elementsToHighlight = element.elements;
                      } else if (element.el_type === 'note' && svg) {
                        // Find note elements by class
                        const notes = svg.querySelectorAll('.abcjs-note, path[data-name="note"]');
                        if (notes.length > 0 && element.startChar !== undefined) {
                          // Use timing to estimate which note
                          const noteIndex = Math.floor((element.startChar / savedContent.length) * notes.length);
                          if (notes[noteIndex]) {
                            elementsToHighlight = [notes[noteIndex]];
                          }
                        }
                      }

                      elementsToHighlight.forEach((el: any) => {
                        if (el && el.classList) {
                          el.classList.add('abcjs-highlight', 'playing');
                          currentNoteElementsRef.current.push(el);
                        }
                      });
                    });
                  }
                }
              });

              timingCallbacks.start();
              timingCallbacksRef.current = timingCallbacks;
              console.log('TimingCallbacks started successfully');

            } catch (tcError) {
              console.error('Error with TimingCallbacks:', tcError);
              setupSimpleHighlighting();
            }
          } else {
            console.log('Using simple highlighting approach');
            setupSimpleHighlighting();
          }

        } catch (error) {
          console.error('Error setting up visualization:', error);
          setupSimpleHighlighting();
        }
      };

      // Simple highlighting based on time estimation
      const setupSimpleHighlighting = () => {
        const visibleContainer = document.querySelector('#artifact-content [data-abc-container="true"]');
        if (!visibleContainer) return;

        const svg = visibleContainer.querySelector('svg');
        if (!svg) return;

        console.log('Setting up simple time-based highlighting');

        // Get all note elements
        const allNotes = Array.from(svg.querySelectorAll('.abcjs-note, .abcjs-rest, path[class*="note"], ellipse, .abcjs-notehead'));
        if (allNotes.length === 0) {
          console.log('No notes found for highlighting');
          return;
        }

        console.log(`Found ${allNotes.length} notes to highlight`);

        // Estimate timing
        let totalDuration = 8000; // Default 8 seconds
        if (visualObj) {
          // Try to get actual duration
          try {
            if (visualObj.millisecondsPerMeasure) {
              const measures = visualObj.lines?.reduce((acc: number, line: any) =>
                acc + (line.staff?.[0]?.voices?.[0]?.length || 0), 0) || 4;
              totalDuration = measures * visualObj.millisecondsPerMeasure;
            }
          } catch (e) {
            console.log('Could not calculate exact duration');
          }
        }

        const timePerNote = totalDuration / allNotes.length;
        const startTime = Date.now();
        let currentNoteIndex = -1;

        const highlightNextNote = () => {
          if (!isPlaying) {
            // Clear all highlights when stopping
            allNotes.forEach(note => {
              note.classList.remove('abcjs-highlight', 'playing');
            });
            return;
          }

          const elapsed = Date.now() - startTime;
          const targetNoteIndex = Math.floor(elapsed / timePerNote);

          if (targetNoteIndex >= allNotes.length) {
            // End of song
            allNotes.forEach(note => {
              note.classList.remove('abcjs-highlight', 'playing');
            });
            return;
          }

          if (targetNoteIndex !== currentNoteIndex) {
            // Remove highlight from previous note
            if (currentNoteIndex >= 0 && allNotes[currentNoteIndex]) {
              allNotes[currentNoteIndex].classList.remove('abcjs-highlight', 'playing');
            }

            // Add highlight to current note
            if (allNotes[targetNoteIndex]) {
              allNotes[targetNoteIndex].classList.add('abcjs-highlight', 'playing');
              currentNoteElementsRef.current = [allNotes[targetNoteIndex]];
            }

            currentNoteIndex = targetNoteIndex;
          }

          requestAnimationFrame(highlightNextNote);
        };

        requestAnimationFrame(highlightNextNote);

        // Store cleanup
        timingCallbacksRef.current = {
          stop: () => {
            allNotes.forEach(note => {
              note.classList.remove('abcjs-highlight', 'playing');
            });
          },
          pause: () => {},
          start: () => {}
        };
      };


      // Initialize the synth
      await synthRef.current.init({
        audioContext: audioContextRef.current,
        visualObj: visualObj,
        options: {
          soundFontUrl: "https://paulrosen.github.io/midi-js-soundfonts/abcjs/",
          onEnded: () => {
            console.log('Playback ended');
            setIsPlaying(false);
            // Stop visualization
            if (timingCallbacksRef.current) {
              try {
                if (timingCallbacksRef.current.stop) {
                  timingCallbacksRef.current.stop();
                }
              } catch (e) {
                console.log('Error stopping timing callbacks:', e);
              }
            }
            // Clear all highlights
            currentNoteElementsRef.current.forEach(elem => {
              elem.classList.remove('abcjs-highlight', 'playing');
              if (elem instanceof SVGElement) {
                elem.style.fill = '';
                elem.style.stroke = '';
                elem.style.transition = '';
              }
            });
            currentNoteElementsRef.current = [];
          }
        }
      });

      // Load the sound font
      await synthRef.current.prime();

      // Start playback
      setIsPlaying(true);

      // Start the synth first
      await synthRef.current.start();

      // Setup visualization after starting playback
      setupVisualization();

      // Safety timeout to reset state
      setTimeout(() => {
        if (isPlaying) {
          setIsPlaying(false);
          if (timingCallbacksRef.current) {
            try {
              if (timingCallbacksRef.current.stop) {
                timingCallbacksRef.current.stop();
              }
            } catch (e) {
              console.log('Error in safety timeout:', e);
            }
          }
          // Clear all highlights
          currentNoteElementsRef.current.forEach(elem => {
            elem.classList.remove('abcjs-highlight', 'playing');
            if (elem instanceof SVGElement) {
              elem.style.fill = '';
              elem.style.stroke = '';
            }
          });
          currentNoteElementsRef.current = [];
        }
      }, 60000); // 60 seconds max

    } catch (error) {
      console.error("Playback error:", error);
      setIsPlaying(false);

      // More specific error messages
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('parse')) {
        alert("The music notation couldn't be parsed. Please check the ABC notation format.");
      } else if (errorMessage.includes('audio')) {
        alert("Audio initialization failed. Please check your browser's audio permissions.");
      } else {
        alert("Unable to play audio. Please try refreshing the page and trying again.");
      }
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

      /*
      if (!visualObjs || visualObjs.length === 0) {
        alert("Unable to parse ABC notation for MIDI export.");
        return;
      }
        */

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
            midiTranspose: 0
          });
        } else {
          // Try to create MIDI using synthesis approach
          const midiSequence = new ABCJS.synth.CreateSynth();
          if (midiSequence && typeof (midiSequence as any).getMidiFile === 'function') {
            midiBuffer = (midiSequence as any).getMidiFile(visualObj);
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
        } else if (!(midiBuffer instanceof Uint8Array)) {
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
        <Button onClick={onClose} size="icon" variant="ghost">
          <XIcon className="w-4 h-4" />
        </Button>
      </CardHeader>

      <CardContent
        id="artifact-content"
        className="border-l border-r p-4 w-full flex-1 max-h-full overflow-hidden relative"
      >
        <InteractiveMusicEditor
          abcNotation={savedContent}
          onAbcChange={(newAbc) => {
            setSavedContent(newAbc);
          }}
          readOnly={generating}
          isPlaying={isPlaying}
          onPlaybackRender={(visualObj) => {
            visualObjRef.current = visualObj;
          }}
        />
      </CardContent>

      <CardFooter className="bg-slate-50 border rounded-lg rounded-t-none py-2 px-6 flex items-center flex-row-reverse gap-4">
        <Button
          onClick={onCopy}
          size="icon"
          variant="outline"
          className="w-8 h-8"
          title="Copy ABC notation"
        >
          {isCopied ? (
            <CheckIcon className="w-4 h-4" />
          ) : (
            <ClipboardIcon className="w-4 h-4" />
          )}
        </Button>
        <Button
          id="play-button"
          onClick={handlePlayAudio}
          size="icon"
          variant={isPlaying ? "default" : "outline"}
          className="w-8 h-8"
          title={isPlaying ? "Stop" : "Play"}
        >
          {isPlaying ? (
            <Square className="w-4 h-4" />
          ) : (
            <PlayIcon className="w-4 h-4" />
          )}
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
