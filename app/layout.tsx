import type { Metadata } from "next";
import "./globals.css";
import { ShortcutHelp } from "@/components/ShortcutHelp";

export const metadata: Metadata = {
  title: "UX Studio",
  description: "From brief to prototype with a team of specialist agents",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ShortcutHelp />
      </body>
    </html>
  );
}
