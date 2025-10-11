"use client";

import SonificationPlayer from "@/components/SonificationPlayer";

export default function SonifyPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center">
      <div className="w-full max-w-3xl mx-auto">
        <SonificationPlayer />
      </div>
    </div>
  );
}
