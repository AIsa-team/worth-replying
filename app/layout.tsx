import { session } from "@/lib/server/auth";
import { AccountBoundary } from "@/components/account-boundary";
import type { Metadata } from "next";
import { IBM_Plex_Mono, Newsreader } from "next/font/google";
import "./globals.css";

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Worth Replying",
  description:
    "Give it a domain. It reads your site, works out who you are for, then reads X and comes back with the handful of conversations worth answering.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const caller = await session();
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${plexMono.variable} h-full antialiased`}
    >
      <head>{caller && <meta name="worth-session" content={caller.id} />}</head>
      <body className="flex min-h-full flex-col">
        {caller && <>
          <AccountBoundary scope={caller.id} />

        </>}
        {children}
      </body>
    </html>
  );
}
