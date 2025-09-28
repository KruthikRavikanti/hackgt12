"use client";

import { ChatPanel } from "@/components/chat/panel";
import { SideNavBar } from "@/components/side-navbar";
import { useSupabase } from "@/lib/supabase";
import { redirect } from "next/navigation";

const NewChatPage = () => {
  const { session } = useSupabase();

  if (!session) redirect("/signin");

  return (
    <div className="flex gap-4 w-full h-screen max-h-screen overflow-hidden px-2 pl-0">
      <SideNavBar />
      <div className="flex-1 flex flex-col">
        <div className="flex justify-end p-4">
          <a href="/sonify">
            <button className="bg-[#121B28] text-white px-4 py-2 rounded-full shadow hover:bg-[#24304a] transition">
              Sonify!
            </button>
          </a>
        </div>
        <ChatPanel id={null} />
      </div>
    </div>
  );
};

export default NewChatPage;
