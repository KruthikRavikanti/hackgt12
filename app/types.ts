import { Database } from "@/app/supabase.types";
import { Message } from "ai";

export type ChatMessageRoles = Message["role"];

export enum Models {
  gpt4o = "gpt-4o",
  gpt4oMini = "gpt-4o-mini",
  gpt35turbo = "gpt-3.5-turbo",
  gpt4turbo = "gpt-4-turbo",
  duet = "duet" // Added duet model
  // Removed Claude/Anthropic model
}


export type Chat = Database["public"]["Tables"]["chats"]["Row"];

export type Attachment = {
  contentType?: string;
  url: string;
  name?: string;
};

export enum OAuthProviders {
  google = "google",
  github = "github",
}
