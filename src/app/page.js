import PublicNavbar from "../components/public/PublicNavbar";
import LandingHero from "../components/public/LandingHero";

export default function PublicLandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <PublicNavbar />
      <main>
        <LandingHero />
      </main>
    </div>
  );
}
