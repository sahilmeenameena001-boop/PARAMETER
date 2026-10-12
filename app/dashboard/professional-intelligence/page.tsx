import type { Metadata } from "next";
import ProfessionalIntelligenceWorkspace from "@/components/professional-intelligence/ProfessionalIntelligenceWorkspace";

export const metadata: Metadata = { title: "Professional Authority Intelligence · SCL" };

export default function ProfessionalIntelligencePage() {
  return <ProfessionalIntelligenceWorkspace />;
}
