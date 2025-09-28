import { Database } from "@/app/supabase.types";
import { Message } from "ai";

export type ChatMessageRoles = Message["role"];

export enum Models {
  gpt5 = "gpt-5",
  gpt4o = "gpt-4o",
  gpt4oMini = "gpt-4o-mini",
  gpt35turbo = "gpt-3.5-turbo",
  gpt4turbo = "gpt-4-turbo",
  claude35sonnet = "claude-3-5-sonnet-20241022",
  claude3opus = "claude-3-opus-20240229",
  claude3sonnet = "claude-3-sonnet-20240229",
  claude3haiku = "claude-3-haiku-20240307",
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
