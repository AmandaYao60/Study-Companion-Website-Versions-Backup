export default function SettingsPage() {
  const sections = [
    ["Camera preferences", "Default camera, resolution, and model startup preferences will live here later."],
    ["Reminder preferences", "Future break and target-duration reminders will be configurable here."],
    ["Privacy controls", "Future data retention and export settings will be added before persistence is connected."],
    ["Account settings", "Authentication-backed profile settings will arrive with a later Supabase phase."],
  ];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Settings</p>
      <h1 className="mt-3 text-3xl font-black text-white">Preferences placeholder</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">These settings are intentionally placeholders for the pre-Supabase product shell. No reminders, authentication, or persistence controls are implemented yet.</p>
      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        {sections.map(([title, body]) => (
          <article key={title} className="rounded-2xl border border-white/10 bg-slate-950/50 p-5 shadow-2xl backdrop-blur-xl">
            <h2 className="text-sm font-bold text-white">{title}</h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">{body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
