import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Catalyst",
  description: "Causal-chain explorer for market hypotheses",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${jetbrains.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-bg text-fg font-mono">
        {children}
        <footer
          data-testid="disclaimer"
          className="shrink-0 border-t border-line px-3 py-1.5 text-[11px] text-muted"
        >
          Model estimates, not investment advice
        </footer>
      </body>
    </html>
  );
}
