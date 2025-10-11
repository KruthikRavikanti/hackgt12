import React, { useEffect, useRef, useState, useCallback } from 'react';
import abcjs from 'abcjs';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Undo,
  Redo,
  Piano,
  Music2,
  Music3,
  Music4,
  Circle,
  Square,
  MessageCircle,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { MusicEditorChat } from '@/components/chat/music-editor-chat';
import { useMusicChat } from '@/lib/hooks/use-music-chat';

interface InteractiveMusicEditorProps {
  abcNotation: string;
  onAbcChange: (newAbc: string) => void;
  readOnly?: boolean;
  isPlaying?: boolean;
  onPlaybackRender?: (visualObj: any) => void;
}

interface NoteButton {
  duration: string;
  icon: React.ReactNode;
  label: string;
  abcDuration: string;
}

const InteractiveMusicEditor: React.FC<InteractiveMusicEditorProps> = ({
  abcNotation,
  onAbcChange,
  readOnly = false,
  isPlaying = false,
  onPlaybackRender
}) => {
  const abcContainerRef = useRef<HTMLDivElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState<string[]>([abcNotation]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [showPiano, setShowPiano] = useState(false);
  const [viewMode, setViewMode] = useState<'visual' | 'text' | 'split'>('visual');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [editingNote, setEditingNote] = useState<{
    charIndex: number;
    originalText: string;
    position: { x: number; y: number };
  } | null>(null);
  const [noteInput, setNoteInput] = useState('');

  // Initialize music chat
  const {
    messages,
    input: chatInput,
    setInput: setChatInput,
    isLoading: chatLoading,
    isChatVisible,
    handleSend: handleChatSend,
    toggleChatVisibility,
  } = useMusicChat({
    abcNotation,
    onAbcSuggestion: (newAbc) => {
      // Handle ABC suggestions from chat
      onAbcChange(newAbc);
      addToHistory(newAbc);
    },
  });

  // Update history when abcNotation prop changes from parent
  useEffect(() => {
    if (abcNotation && abcNotation !== history[historyIndex]) {
      setHistory([abcNotation]);
      setHistoryIndex(0);
    }
  }, [abcNotation]);

  const noteButtons: NoteButton[] = [
    { duration: 'whole', icon: <Circle className="w-4 h-4" />, label: 'Whole', abcDuration: '4' },
    { duration: 'half', icon: <Circle className="w-4 h-4" />, label: 'Half', abcDuration: '2' },
    { duration: 'quarter', icon: <Music2 className="w-4 h-4" />, label: 'Quarter', abcDuration: '' },
    { duration: 'eighth', icon: <Music3 className="w-4 h-4" />, label: 'Eighth', abcDuration: '/2' },
    { duration: 'sixteenth', icon: <Music4 className="w-4 h-4" />, label: 'Sixteenth', abcDuration: '/4' },
  ];

  const pianoKeys = [
    { note: 'C', abc: 'C', color: 'white' },
    { note: 'C#', abc: '^C', color: 'black' },
    { note: 'D', abc: 'D', color: 'white' },
    { note: 'D#', abc: '^D', color: 'black' },
    { note: 'E', abc: 'E', color: 'white' },
    { note: 'F', abc: 'F', color: 'white' },
    { note: 'F#', abc: '^F', color: 'black' },
    { note: 'G', abc: 'G', color: 'white' },
    { note: 'G#', abc: '^G', color: 'black' },
    { note: 'A', abc: 'A', color: 'white' },
    { note: 'A#', abc: '^A', color: 'black' },
    { note: 'B', abc: 'B', color: 'white' },
    { note: 'c', abc: 'c', color: 'white' },
    { note: 'c#', abc: '^c', color: 'black' },
    { note: 'd', abc: 'd', color: 'white' },
  ];

  const addToHistory = useCallback((newAbc: string) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newAbc);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  // Toggle fullscreen mode
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      editorContainerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  // Listen for fullscreen changes (e.g., ESC key)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Simple note click handler that identifies the position in the ABC string
  const handleNoteClick = useCallback((abcElem: any, tuneNumber: number, classes: string, analysis: any, drag: any, mouseEvent: MouseEvent) => {
    console.log('Note clicked:', { classes, analysis, abcElem });

    if (readOnly || isPlaying) {
      console.log('Click ignored - readOnly:', readOnly, 'isPlaying:', isPlaying);
      return;
    }

    // Check if this is a note element
    if (!classes || (!classes.includes('note') && !classes.includes('chord'))) {
      console.log('Not a note element, classes:', classes);
      return;
    }

    // Try to get position from abcElem first (more reliable)
    let startChar = abcElem?.startChar;
    let endChar = abcElem?.endChar;

    // Fallback to analysis if not in abcElem
    if (startChar === undefined && analysis) {
      startChar = analysis.startChar;
      endChar = analysis.endChar;
    }

    console.log('Character positions - start:', startChar, 'end:', endChar);

    if (startChar !== undefined && startChar !== null) {
      // Set a reasonable end position if not provided
      if (!endChar || endChar <= startChar) {
        endChar = startChar + 2; // Most notes are 1-2 chars
      }

      // Extract the note text from the ABC notation
      const noteText = abcNotation.substring(startChar, endChar);
      console.log('Note text extracted:', noteText, 'from positions', startChar, '-', endChar);
      console.log('Full ABC around note:', abcNotation.substring(Math.max(0, startChar - 5), Math.min(abcNotation.length, endChar + 5)));

      // More comprehensive regex to match ABC note patterns
      // This matches: optional accidental + note letter + optional octave indicators + optional duration
      const noteMatch = noteText.match(/([\^_=]?[A-Ga-g][,']*[\d\/\-]*)/);

      if (noteMatch) {
        console.log('Setting editing note:', noteMatch[0]);
        const rect = (mouseEvent.target as Element).getBoundingClientRect();
        setEditingNote({
          charIndex: startChar,
          originalText: noteMatch[0],
          position: { x: rect.left + rect.width / 2, y: rect.top }
        });
        setNoteInput(noteMatch[0]);
      } else {
        console.log('No note match found in:', noteText);
        // Try a simpler match for just the note letter
        const simpleMatch = abcNotation.substring(startChar, startChar + 1).match(/[A-Ga-g]/);
        if (simpleMatch) {
          console.log('Simple match found:', simpleMatch[0]);
          const rect = (mouseEvent.target as Element).getBoundingClientRect();
          setEditingNote({
            charIndex: startChar,
            originalText: simpleMatch[0],
            position: { x: rect.left + rect.width / 2, y: rect.top }
          });
          setNoteInput(simpleMatch[0]);
        }
      }
    } else {
      console.log('No character position found');
    }
  }, [abcNotation, readOnly, isPlaying]);

  // Handle note edit submission
  const handleNoteEdit = () => {
    if (!editingNote || !noteInput.trim()) {
      setEditingNote(null);
      return;
    }

    // Replace the note in the ABC notation
    const before = abcNotation.substring(0, editingNote.charIndex);
    const after = abcNotation.substring(editingNote.charIndex + editingNote.originalText.length);
    const newAbc = before + noteInput.trim() + after;

    onAbcChange(newAbc);
    addToHistory(newAbc);
    setEditingNote(null);
    setNoteInput('');
  };

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (editingNote) {
        const target = event.target as Element;
        if (!target.closest('.note-edit-popup')) {
          setEditingNote(null);
          setNoteInput('');
        }
      }
    };

    if (editingNote) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [editingNote]);

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      onAbcChange(history[newIndex]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      onAbcChange(history[newIndex]);
    }
  };

  useEffect(() => {
    if (abcContainerRef.current && viewMode !== 'text') {
      // Clear the container first
      abcContainerRef.current.innerHTML = '';

      const renderOptions: any = {
        add_classes: true,
        clickListener: !readOnly && !isPlaying ? handleNoteClick : null
      };

      try {
        const visualObjs = abcjs.renderAbc(abcContainerRef.current, abcNotation, renderOptions);

        // Send the visual object to parent for playback if needed
        if (onPlaybackRender && visualObjs[0]) {
          onPlaybackRender(visualObjs[0]);
        }

        // Add styles for animation
        const style = document.createElement('style');
        style.textContent = `
          .abcjs-note.playing,
          .abcjs-rest.playing,
          .abcjs-bar.playing,
          .abcjs-chord.playing {
            fill: #3b82f6 !important;
            stroke: #3b82f6 !important;
            animation: pulse 0.3s ease-in-out;
          }

          @keyframes pulse {
            0% { transform: scale(1); opacity: 0.8; }
            50% { transform: scale(1.1); opacity: 1; }
            100% { transform: scale(1); opacity: 0.8; }
          }

          .abcjs-note,
          .abcjs-rest,
          .abcjs-chord {
            transition: fill 0.2s ease-in-out, stroke 0.2s ease-in-out, transform 0.2s ease-in-out;
          }
        `;
        if (!document.getElementById('abcjs-playback-styles')) {
          style.id = 'abcjs-playback-styles';
          document.head.appendChild(style);
        }

        // Add hover effect for notes (visual only, no interaction)
        if (!isPlaying && !readOnly) {
          const notes = abcContainerRef.current.querySelectorAll('.abcjs-note');
          notes.forEach((note: any) => {
            note.classList.add('hover:opacity-80', 'transition-opacity');
          });
        }
      } catch (error) {
        console.error('Error rendering ABC notation:', error);
      }
    }
  }, [abcNotation, readOnly, viewMode, isPlaying, onPlaybackRender, handleNoteClick]);

  const addNoteFromPiano = (noteAbc: string) => {
    const lines = abcNotation.split('\n');

    // Find the last line that contains actual notes (not headers or comments)
    let noteLineIndex = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      // Skip empty lines, comments, and header lines
      if (line && !line.startsWith('%') && !line.includes(':')) {
        noteLineIndex = i;
        break;
      }
    }

    if (noteLineIndex >= 0) {
      // Add to existing note line
      const currentLine = lines[noteLineIndex];
      // Remove trailing bar if present
      const cleanLine = currentLine.replace(/\s*\|\s*$/, '');
      lines[noteLineIndex] = cleanLine + ' ' + noteAbc + ' |';
    } else {
      // No note lines found, add after headers
      let headerEndIndex = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(':') || lines[i].startsWith('%')) {
          headerEndIndex = i;
        } else if (lines[i].trim()) {
          break;
        }
      }
      lines.splice(headerEndIndex + 1, 0, noteAbc + ' |');
    }

    const newAbc = lines.join('\n');
    onAbcChange(newAbc);
    addToHistory(newAbc);
  };

  const addNoteWithDuration = (duration: string) => {
    const lines = abcNotation.split('\n');

    // Find the last line that contains actual notes (not headers or comments)
    let noteLineIndex = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      // Skip empty lines, comments, and header lines
      if (line && !line.startsWith('%') && !line.includes(':')) {
        noteLineIndex = i;
        break;
      }
    }

    if (noteLineIndex >= 0) {
      // Add to existing note line
      const currentLine = lines[noteLineIndex];
      // Remove trailing bar if present
      const cleanLine = currentLine.replace(/\s*\|\s*$/, '');
      lines[noteLineIndex] = cleanLine + ' C' + duration + ' |';
    } else {
      // No note lines found, add after headers
      // Find where headers end
      let headerEndIndex = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(':') || lines[i].startsWith('%')) {
          headerEndIndex = i;
        } else if (lines[i].trim()) {
          break;
        }
      }
      lines.splice(headerEndIndex + 1, 0, 'C' + duration + ' |');
    }

    const newAbc = lines.join('\n');
    onAbcChange(newAbc);
    addToHistory(newAbc);
  };

  return (
    <div
      ref={editorContainerRef}
      className={`w-full h-full flex flex-col space-y-4 ${isFullscreen ? 'bg-gray-50 p-4' : ''}`}
    >
      {!readOnly && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleUndo}
                disabled={historyIndex <= 0}
              >
                <Undo className="w-4 h-4 mr-1" />
                Undo
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRedo}
                disabled={historyIndex >= history.length - 1}
              >
                <Redo className="w-4 h-4 mr-1" />
                Redo
              </Button>
            </div>

            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
              <TabsList>
                <TabsTrigger value="visual">Visual</TabsTrigger>
                <TabsTrigger value="split">Split</TabsTrigger>
                <TabsTrigger value="text">Text</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPiano(!showPiano)}
              >
                <Piano className="w-4 h-4 mr-1" />
                {showPiano ? 'Hide' : 'Show'} Piano
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleChatVisibility}
                className={isChatVisible ? 'bg-purple-50 border-purple-300' : ''}
              >
                <MessageCircle className="w-4 h-4 mr-1" />
                {isChatVisible ? 'Hide' : 'Show'} Assistant
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              >
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="flex items-center space-x-2 mb-4">
            <span className="text-sm font-medium">Add Note:</span>
            {noteButtons.map((btn) => (
              <Button
                key={btn.duration}
                variant="outline"
                size="sm"
                onClick={() => addNoteWithDuration(btn.abcDuration)}
                title={btn.label}
              >
                {btn.icon}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => addNoteWithDuration('z')}
              title="Rest"
            >
              <Square className="w-4 h-4" />
            </Button>
          </div>

          {showPiano && (
            <div className="relative h-32 bg-gray-100 rounded-lg p-4 mb-4">
              <div className="flex h-full relative">
                {pianoKeys.map((key, index) => {
                  const isBlack = key.color === 'black';
                  return (
                    <button
                      key={index}
                      onClick={() => addNoteFromPiano(key.abc)}
                      className={`
                        ${isBlack
                          ? 'bg-gray-900 text-white w-8 h-20 z-10 -mx-4 hover:bg-gray-700'
                          : 'bg-white border border-gray-300 flex-1 h-full hover:bg-gray-100'
                        }
                        rounded-b transition-colors flex items-end justify-center pb-2 text-xs font-semibold
                      `}
                      style={isBlack ? { position: 'relative' } : {}}
                    >
                      {key.note}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      )}

      <div className="flex-1 overflow-auto">
        {viewMode === 'visual' && (
          <div
            key={abcNotation} // Force re-render when ABC notation changes
            ref={abcContainerRef}
            data-abc-container="true"
            className="w-full min-h-full p-4 bg-white rounded-lg"
          />
        )}

        {viewMode === 'text' && (
          <textarea
            value={abcNotation}
            onChange={(e) => {
              onAbcChange(e.target.value);
              addToHistory(e.target.value);
            }}
            className="w-full h-full p-4 font-mono text-sm border rounded-lg"
            readOnly={readOnly}
          />
        )}

        {viewMode === 'split' && (
          <div className="grid grid-cols-2 gap-4 h-full">
            <div
              key={abcNotation} // Force re-render when ABC notation changes
              ref={abcContainerRef}
              className="w-full h-full p-4 bg-white rounded-lg overflow-auto"
            />
            <textarea
              value={abcNotation}
              onChange={(e) => {
                onAbcChange(e.target.value);
                addToHistory(e.target.value);
              }}
              className="w-full h-full p-4 font-mono text-sm border rounded-lg"
              readOnly={readOnly}
            />
          </div>
        )}
      </div>

      {/* Simple Note Edit Popup */}
      {editingNote && (
        <div
          className="note-edit-popup fixed z-50 bg-white border-2 border-gray-300 rounded-lg shadow-xl p-4"
          style={{
            left: `${editingNote.position.x}px`,
            top: `${editingNote.position.y}px`,
            transform: 'translate(-50%, -120%)'
          }}
        >
          <div className="space-y-2">
            <div className="text-sm font-semibold">Edit Note</div>
            <div className="text-xs text-gray-500">Current: {editingNote.originalText}</div>
            <div className="flex gap-2">
              <input
                type="text"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleNoteEdit();
                  } else if (e.key === 'Escape') {
                    setEditingNote(null);
                    setNoteInput('');
                  }
                }}
                className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., C, D, E, c, d"
                autoFocus
              />
              <Button
                size="sm"
                onClick={handleNoteEdit}
              >
                OK
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditingNote(null);
                  setNoteInput('');
                }}
              >
                Cancel
              </Button>
            </div>
            <div className="text-xs text-gray-400">
              Tips: C D E F G A B (middle), c d e (high), C, D, (low)
            </div>
          </div>
        </div>
      )}

      {/* Music Editor Chat Assistant */}
      <MusicEditorChat
        abcNotation={abcNotation}
        onAbcSuggestion={(newAbc) => {
          onAbcChange(newAbc);
          addToHistory(newAbc);
        }}
        isVisible={isChatVisible}
        onToggleVisibility={toggleChatVisibility}
        messages={messages}
        input={chatInput}
        setInput={setChatInput}
        onSubmit={handleChatSend}
        isLoading={chatLoading}
      />
    </div>
  );
};

export default InteractiveMusicEditor;