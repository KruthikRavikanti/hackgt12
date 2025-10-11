import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GithubIcon, RocketIcon, MenuIcon } from "lucide-react";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';


export default async function LandingPage() {
  // Bypass auth for development - redirect directly to /new

  const supabase = createServerComponentClient({ cookies });


  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/new");
  }
  

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-[#121B28] shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-white">Duet</h1>

            <label htmlFor="menu-toggle" className="sm:hidden cursor-pointer">
              <MenuIcon className="h-6 w-6" />
            </label>

            <input type="checkbox" id="menu-toggle" className="hidden" />

            <nav className="hidden sm:flex flex-col sm:flex-row items-center gap-4 absolute sm:static left-0 right-0 top-full bg-white sm:bg-transparent shadow-md sm:shadow-none pb-4 sm:pb-0">
              <Link href="/signin">
                <Button variant="ghost" className="text-white">Sign In</Button>
              </Link>
              <Link href="/signup">
                <Button>Sign Up</Button>
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="flex-grow bg-[#121B28]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-extrabold text-white bg-clip-text bg-gradient-to-b from-white to-gray-400 sm:text-5xl md:text-6xl">
              Compose, Sonify, and Collaborate with AI
            </h2>
            <p className="mt-3 max-w-md mx-auto text-base text-gray-200 sm:text-lg md:mt-4 md:text-xl md:max-w-3xl">
              Duet is your all-in-one platform for creative music and sound generation. Upload sports clips to turn action into music, chat with AI to compose, and share your creations with the world.
            </p>
          </div>
          <div className="relative">
            <Image
              src="/demo.png"
              alt="Duet Demo"
              width={1200}
              height={675}
              className="rounded-lg shadow-2xl pt-1"
            />
          </div>
          <div className="mt-20 flex flex-col items-center">
            <h3 className="text-3xl font-bold text-white mb-6 text-center">
              🎵 AI Music & Sound Creation
            </h3>
            <p className="max-w-lg text-center text-lg text-gray-200 mb-8">
              Use Duet to turn your ideas, text, or video clips into music and sound. Collaborate with AI, iterate naturally, and share your results instantly.
            </p>
          </div>
        </div>
      </main>

      {/* Removed footer with credits and GitHub link */}
    </div>
  );
}
