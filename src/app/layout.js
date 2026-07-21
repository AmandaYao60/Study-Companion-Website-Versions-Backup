import "./globals.css";
import { AppProvider } from "../context/AppContext";

export const metadata = {
  title: "AegisMind - AI Study Companion",
  description: "A private browser-local AI study companion for focused sessions, Focus Space, and session analytics.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full bg-slate-950 text-slate-100 selection:bg-cyan-500/30 selection:text-cyan-200">
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
