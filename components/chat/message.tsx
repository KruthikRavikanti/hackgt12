"use client";

import { Attachment, ChatMessageRoles, Models } from "@/app/types";
import { AttachmentPreviewButton } from "@/components/chat/attachment-preview-button";
import Markdown from "@/components/markdown/markdown";
import { Button } from "@/components/ui/button";
import {
  ArtifactMessagePartData,
  MessagePart as MessagePartType,
  parseMessage,
} from "@/lib/utils";
import { CodeIcon, Loader2Icon, UserIcon, Music2Icon } from "lucide-react";
import Image from "next/image";
import duetIcon from "/public/duet.png";  // Import the Duet icon

const getDisplayNameFromRole = (
  role: ChatMessageRoles,
  model: Models | null
) => {
  if (role === "user") return "Me";

  switch (model) {
    case Models.gpt5:
      return "GPT-5";
    case Models.gpt4o:
      return "GPT 4o";
    default:
      return model;
  }
};

type Props = {
  role: ChatMessageRoles;
  model: Models | null;
  text: string;
  setCurrentArtifact: (data: ArtifactMessagePartData) => void;
  attachments: Attachment[];
};

export const ChatMessage = ({
  role,
  text,
  attachments,
  setCurrentArtifact,
}: Props) => {
  const isUser = role === "user";

  return (
    <div
      className={`flex items-end gap-3 px-4 py-2 ${
        isUser ? "flex-row-reverse" : "flex-row"
      }`}
    >
      {/* Avatar */}
      <div
        className={`flex-shrink-0 rounded-full p-2 ${
          isUser ? "bg-blue-950" : "bg-gray-200"
        }`}
      >
        {isUser ? (
          <UserIcon size={20} className="text-white" />
        ) : (
          <div className="relative w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center">
          <Image
            src={duetIcon}
            alt="Duet Icon"
            width={20}
            height={20}
            className="object-cover"
            style={{ transform: 'scale(1.5)' }} // Scales the image to 250%
          />
        </div>
        
        
        
        
        
        

        
        
  // Replaced BotIcon with Duet icon
        )}
      </div>

      {/* Message Content */}
      <div
        className={`flex flex-col gap-2 max-w-[80%] ${
          isUser ? "items-end" : "items-start"
        }`}
      >
        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {attachments.map((attachment, index) => (
              <AttachmentPreviewButton key={index} value={attachment} />
            ))}
          </div>
        )}

        {/* Message Bubble */}
        <div
          className={`rounded-2xl px-4 pb-2 flex flex-col items-center text-center ${
            isUser
              ? "bg-slate-300 text-gray-900 "
              : "bg-gray-200 text-gray-900 "
          }`}
        > 
          {isUser ? (
            <div className="prose prose-sm max-w-none prose-invert">
              <Markdown text={text} />
            </div>
          ) : (
            parseMessage(text).map((part, index) => (
              <MessagePart
                data={part}
                key={index}
                setCurrentArtifact={setCurrentArtifact}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

const MessagePart = ({
  data,
  setCurrentArtifact,
}: {
  data: MessagePartType;
  setCurrentArtifact: (data: ArtifactMessagePartData) => void;
}) => {
  if (data.type === "text")
    return (
      <div className="prose prose-sm max-w-none">
        <Markdown text={data.data} />
      </div>
    );

  if (data.type === "artifact")
    return (
      <Button
        variant="outline"
        className="flex justify-start h-fit w-fit py-0 px-0 my-2 bg-white hover:bg-gray-50 transition-colors"
        onClick={() => setCurrentArtifact(data.data)}
      >
        <div className="w-12 h-full flex items-center justify-center border-r">
          {data.data.generating ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <Music2Icon size={18} />
          )}
        </div>

        <div className="flex flex-col gap-0.5 items-start px-3 py-2">
          <span className="break-words text-sm font-semibold leading-tight">
            {data.data?.title || "Generating"}
          </span>
          <span className="text-gray-500 line-clamp-1 text-xs">
            {data.data?.content ? "Open music" : ""}
          </span>
        </div>
      </Button>
    );

  return null;
};
