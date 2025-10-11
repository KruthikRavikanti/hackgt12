"use client";

import { ChatItem } from "@/components/side-navbar/chat-item";
import { UserSettings } from "@/components/side-navbar/user-settings";
import { Button } from "@/components/ui/button";
import { UserButton } from "@/components/user-button";
import { getChats } from "@/lib/db";
import { useSupabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";
import { Loader2Icon, SidebarIcon, SquarePenIcon } from "lucide-react";
//import Image from "next/image";
import Link from "next/link";
import Image from "next/image"
import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import DuetIcon from "@/public/duet.png";

export const SideNavBar = () => {
  const [open, setOpen] = useState(false);
  const params = useParams();

  const { supabase, session } = useSupabase();
  const userId = session?.user.id;

  // Log session and userId to debug authentication issues
  console.log("Session:", session);
  console.log("User ID:", userId);

  // Fetch chats from database
  const { data: chats = [], isLoading } = useQuery({
    queryKey: ["chats", userId],
    queryFn: () => getChats(supabase, userId),
    enabled: !!userId,
  });

  if (open) {
    return (
      <div className="h-screen max-h-screen overflow-hidden flex flex-col gap-4 justify-between px-2 py-2 pb-4 bg-[#121b28] w-[200px]">
        <div className="flex flex-col gap-2">
            <Link
            href="/"
            className="text-lg font-semibold text-center text-[#f8f6f3] bg-"
            >
            {/* <Image src={DuetIcon} alt="Duet" className="inline-block mr-2 text-sm" width={20} height={20} /> */}
            Duet
            </Link>

          <div className="flex items-center justify-between gap-2 text-white">
            <Button onClick={() => setOpen(false)} size="icon" variant="ghost">
              <SidebarIcon className="w-4 h-4" />
            </Button>

            <Link href="/new">
              <Button size="icon" variant="ghost">
                <SquarePenIcon className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>

        <div className="flex flex-col flex-1 gap-2 overflow-hidden">
          <span className="font-medium text-[#f8f6f3]">Chats</span>
          <div className="flex flex-col flex-1 gap-2 overflow-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2Icon className="w-4 h-4 animate-spin text-gray-400" />
              </div>
            ) : chats.length === 0 ? (
              <div className="text-sm text-gray-400 text-center py-4">
                No chats yet
              </div>
            ) : (
              chats.map((item) => (
                <ChatItem
                  key={item.id}
                  id={item.id}
                  title={item.title}
                  selected={params.id === item.id}
                />
              ))
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4 mt-2">
          {/* <a
            href="https://github.com/13point5/open-artifacts"
            target="_blank"
            className="text-black flex items-center gap-4 px-1"
          >
            <Image src="/github.svg" height="24" width="24" alt="github logo" />
            <span className="text-sm font-medium">GitHub Repo</span>
          </a> */}
          <UserSettings showLabel />
          <UserButton expanded />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#121b28] h-screen max-h-screen flex flex-col gap-2 justify-between px-2 py-2 pb-4 items-center">
      <div className="flex flex-col gap-2">
        <Link href="/" className="text-lg font-semibold text-center text-white">
          Duet
        </Link>

        <div className="flex items-center gap-2">
          <Button onClick={() => setOpen(true)} size="icon" variant="ghost">
            <SidebarIcon className="w-4 h-4 text-white hover:text-[#121b28]" />
          </Button>

          <Link href="/new">
            <Button size="icon" variant="ghost">
              <SquarePenIcon className="w-4 h-4 text-white hover:text-[#121b28]" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex flex-col flex-1 gap-2 overflow-hidden w-full">
        <span className="font-medium text-[#f8f6f3]">Chats</span>
        <div className="flex flex-col flex-1 gap-2 overflow-auto w-full">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2Icon className="w-4 h-4 animate-spin text-gray-400" />
            </div>
          ) : chats.length === 0 ? (
            <div className="text-sm text-gray-400 text-center py-4">
              No chats yet
            </div>
          ) : (
            chats.map((item) => (
              <ChatItem
                key={item.id}
                id={item.id}
                title={item.title}
                selected={params.id === item.id}
              />
            ))
          )}
        </div>
      </div>
      <div className="flex flex-col items-center gap-4">
        <UserSettings />
        <UserButton />
      </div>
    </div>
  );
};
