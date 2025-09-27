import type { Metadata } from "next";
import { Inter as FontSans } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "react-hot-toast";
import ReactQueryProvider from "@/app/react-query-provider";
import { cookies } from "next/headers";
import { SupabaseProvider } from "@/lib/supabase";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";

export const dynamic = 'force-dynamic';

const fontSans = FontSans({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Duet",
  description: "Compose, Create, and Share Music with Duet using ABC Notation",
};


export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = createServerComponentClient({ cookies });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  return (
    <html lang="en">
      <body
        className={cn("min-h-screen font-sans antialiased", fontSans.variable)}
      >
        <SupabaseProvider session={session}>
          <ReactQueryProvider>
            {children}

            <Toaster />
          </ReactQueryProvider>
        </SupabaseProvider>
      </body>
    </html>
  );
}