import Link from "next/link";
import PublicNavbar from "../../components/public/PublicNavbar";

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <PublicNavbar />
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-xl items-center px-4 py-12">
        <section className="w-full rounded-3xl border border-white/10 bg-slate-950/50 p-8 text-center shadow-2xl backdrop-blur-xl">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Authentication placeholder</p>
          <h1 className="mt-3 text-3xl font-black text-white">Get Started</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">Account creation will arrive with a later authentication phase. The demo product currently keeps completed session history locally in this browser.</p>
          <Link href="/app" className="mt-6 inline-flex rounded-xl bg-cyan-400 px-5 py-3 text-sm font-bold text-slate-950 transition-all hover:bg-cyan-300">
            Continue to Demo Product
          </Link>
        </section>
      </main>
    </div>
  );
}
