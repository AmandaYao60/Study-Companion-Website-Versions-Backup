export default function AccountPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-white/10 bg-slate-950/50 p-8 shadow-2xl backdrop-blur-xl">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Account</p>
        <h1 className="mt-3 text-3xl font-black text-white">Account</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
          Profile and authentication settings will become available after Supabase Auth is connected.
        </p>
      </section>
    </div>
  );
}
