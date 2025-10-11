"use client";

import React, { useEffect, useRef, useState } from "react";
import { Message } from "ai/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  MessageCircle,
  X,
  Send,
  Minimize2,
  Maximize2,
  Music
} from "lucide-react";
import Textarea from "react-textarea-autosize";
import { useEnterSubmit } from "@/lib/hooks/use-enter-submit";
import ReactMarkdown from "react-markdown";
import toast from "react-hot-toast";

interface MusicEditorChatProps {
  abcNotation: string;
  onAbcSuggestion?: (newAbc: string) => void;
  isVisible: boolean;
  onToggleVisibility: () => void;
  messages: Message[];
  input: string;
  setInput: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

export const MusicEditorChat: React.FC<MusicEditorChatProps> = ({
  abcNotation,
  onAbcSuggestion,
  isVisible,
  onToggleVisibility,
  messages,
  input,
  setInput,
  onSubmit,
  isLoading,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { onKeyDown } = useEnterSubmit({ onSubmit });
  const [isMinimized, setIsMinimized] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(false);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current && !isMinimized) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isMinimized]);

  // Show notification for new messages when minimized
  useEffect(() => {
    if (isMinimized && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant') {
        setHasNewMessage(true);
      }
    }
  }, [messages, isMinimized]);

  // Clear notification when expanding
  const handleToggleMinimize = () => {
    setIsMinimized(!isMinimized);
    if (isMinimized) {
      setHasNewMessage(false);
    }
  };

  // Parse ABC suggestions from assistant messages
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'assistant' && onAbcSuggestion) {
      // Look for ABC notation blocks in the message
      const abcMatch = lastMessage.content.match(/```abc\n([\s\S]*?)```/);
      if (abcMatch && abcMatch[1]) {
        // You could add a button to apply the suggestion instead of auto-applying
        // For now, we'll just extract it for potential use
      }
    }
  }, [messages, onAbcSuggestion]);

  if (!isVisible) {
    return (
      <Button
        onClick={onToggleVisibility}
        className="fixed bottom-20 right-4 rounded-full shadow-lg z-50"
        size="icon"
        variant="default"
      >
        <MessageCircle className="w-5 h-5" />
      </Button>
    );
  }

  return (
    <Card className={`fixed bottom-20 right-4 shadow-2xl z-50 transition-all duration-300 ${
      isMinimized ? 'w-64 h-14' : 'w-96 h-[600px]'
    } flex flex-col`}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b bg-gradient-to-r from-purple-50 to-blue-50">
        <div className="flex items-center gap-2">
          <Music className="w-4 h-4 text-purple-600" />
          <span className="font-semibold text-sm">Music Assistant</span>
          {hasNewMessage && isMinimized && (
            <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">New</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            onClick={handleToggleMinimize}
            size="icon"
            variant="ghost"
            className="w-7 h-7"
          >
            {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
          </Button>
          <Button
            onClick={onToggleVisibility}
            size="icon"
            variant="ghost"
            className="w-7 h-7"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Current ABC Context Indicator */}
          <div className="px-3 py-2 bg-blue-50 border-b">
            <div className="text-xs text-blue-700">
              <span className="font-semibold">Current Composition:</span>
              <span className="ml-2 text-blue-600">
                {abcNotation.split('\n').find(line => line.startsWith('T:'))?.substring(2) || 'Untitled'}
              </span>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 mt-8">
                <Music className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-sm">Hi! I'm your music assistant.</p>
                <p className="text-xs mt-2">I can help you with:</p>
                <ul className="text-xs mt-2 space-y-1">
                  <li>• Analyzing your composition</li>
                  <li>• Suggesting improvements</li>
                  <li>• Explaining music theory</li>
                  <li>• Converting notes and chords</li>
                </ul>
              </div>
            )}

            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 ${
                    message.role === 'user'
                      ? 'bg-purple-500 text-white'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  <div className="text-sm">
                    <ReactMarkdown
                      className="prose prose-sm max-w-none"
                      components={{
                        code: ({ className, children, ...props }) => {
                          const isAbc = className?.includes('language-abc');
                          if (isAbc && onAbcSuggestion) {
                            const abcContent = String(children).trim();
                            return (
                              <div className="relative bg-gray-50 p-2 rounded my-2">
                                <pre className="overflow-x-auto text-xs">
                                  <code className={className} {...props}>
                                    {children}
                                  </code>
                                </pre>
                                <Button
                                  onClick={() => {
                                    onAbcSuggestion(abcContent);
                                    toast.success('ABC notation updated!');
                                  }}
                                  size="sm"
                                  className="absolute top-2 right-2 bg-green-500 hover:bg-green-600 text-white text-xs"
                                >
                                  Apply Changes
                                </Button>
                              </div>
                            );
                          }
                          return <code className={className} {...props}>{children}</code>;
                        },
                        p: ({ children }) => <p className="mb-2">{children}</p>,
                        ul: ({ children }) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-lg px-3 py-2">
                  <div className="flex space-x-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100" />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200" />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t p-3">
            <div className="flex gap-2">
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Ask about your composition..."
                className="flex-1 min-h-[40px] max-h-32 resize-none rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                rows={1}
              />
              <Button
                onClick={onSubmit}
                disabled={isLoading || !input.trim()}
                size="icon"
                className="bg-purple-500 hover:bg-purple-600"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <div className="text-xs text-gray-500 mt-2">
              Your current ABC notation is automatically included as context
            </div>
          </div>
        </>
      )}
    </Card>
  );
};