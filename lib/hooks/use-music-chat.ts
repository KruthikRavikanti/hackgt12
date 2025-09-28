import { useChat } from "ai/react";
import { useEffect, useRef, useState } from "react";
import { getSettings } from "@/lib/userSettings";
import { Models } from "@/app/types";
import toast from "react-hot-toast";

interface UseMusicChatProps {
  abcNotation: string;
  onAbcSuggestion?: (newAbc: string) => void;
}

export function useMusicChat({ abcNotation, onAbcSuggestion }: UseMusicChatProps) {
  const [isChatVisible, setIsChatVisible] = useState(false);
  const previousAbcRef = useRef<string>(abcNotation);
  const lastUserMessageRef = useRef<string>("");

  // Initialize chat with music-specific context
  const {
    messages,
    input,
    setInput,
    append,
    isLoading,
  } = useChat({
    api: '/api/chat',
    onFinish: (message) => {
      // Check if the assistant's response contains ABC notation
      if (message.role === 'assistant' && onAbcSuggestion) {
        const abcMatch = message.content.match(/```abc\n([\s\S]*?)```/);
        if (abcMatch && abcMatch[1]) {
          // The component will handle showing the "Apply" button
          console.log('ABC suggestion detected:', abcMatch[1]);
        }
      }
    },
    onError: (error) => {
      console.error('Chat error:', error);
      toast.error('Failed to get response. Please check your API settings.');
    },
  });

  // Handle sending messages with ABC context
  const handleSend = async () => {
    const query = input.trim();
    if (!query) return;

    const settings = getSettings();

    // Check for API key
    if (settings.model.startsWith("gpt") && !settings.openaiApiKey) {
      toast.error("Please enter your OpenAI API Key in settings");
      return;
    }

    if (settings.model.startsWith("claude") && !settings.anthropicApiKey) {
      toast.error("Please enter your Anthropic API Key in settings");
      return;
    }

    // Store the last user message
    lastUserMessageRef.current = query;

    // Create the message with ABC context
    const messageWithContext = `Current ABC Notation:
\`\`\`abc
${abcNotation}
\`\`\`

User Question: ${query}`;

    // Send the message with the model and API key
    await append(
      {
        role: "user",
        content: messageWithContext, // Include full context in the message
      },
      {
        body: {
          model: settings.model || Models.gpt4o,
          apiKey: settings.openaiApiKey || settings.anthropicApiKey,
        },
      }
    );

    setInput("");
  };

  // Debounced ABC notation sync
  useEffect(() => {
    const timer = setTimeout(() => {
      if (previousAbcRef.current !== abcNotation && messages.length > 0) {
        // Only update context if there's an ongoing conversation
        previousAbcRef.current = abcNotation;

        // You could optionally append a system message here to update context
        // But for now, we'll include it with each user message
      }
    }, 1000); // Debounce for 1 second

    return () => clearTimeout(timer);
  }, [abcNotation, messages.length]);

  // Toggle chat visibility
  const toggleChatVisibility = () => {
    setIsChatVisible(!isChatVisible);
  };

  // Helper function to extract musical elements from ABC
  const analyzeABC = (abc: string) => {
    const lines = abc.split('\n');
    const title = lines.find(l => l.startsWith('T:'))?.substring(2).trim() || 'Untitled';
    const key = lines.find(l => l.startsWith('K:'))?.substring(2).trim() || 'C';
    const meter = lines.find(l => l.startsWith('M:'))?.substring(2).trim() || '4/4';
    const tempo = lines.find(l => l.startsWith('Q:'))?.substring(2).trim() || '120';

    return { title, key, meter, tempo };
  };

  // Suggest quick actions based on current ABC
  const getSuggestions = () => {
    const { key, meter } = analyzeABC(abcNotation);

    return [
      `Analyze the harmony in this ${key} composition`,
      `Suggest a chord progression for ${meter} time`,
      'Add a complementary bass line',
      'Convert to a different key',
      'Explain the musical structure',
    ];
  };

  return {
    // Chat state
    messages,
    input,
    setInput,
    isLoading,
    isChatVisible,

    // Actions
    handleSend,
    toggleChatVisibility,

    // Helpers
    analyzeABC,
    getSuggestions,

    // ABC-specific
    currentAbc: abcNotation,
  };
}