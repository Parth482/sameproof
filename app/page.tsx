import { HeroSection } from "@/components/hero/hero-section";
import { JourneySteps } from "@/components/hero/journey-steps";

export default function Home() {
  return (
    <main className="overflow-hidden">
      <HeroSection />
      <JourneySteps />
    </main>
  );
}
