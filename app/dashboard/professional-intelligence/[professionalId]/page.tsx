import LiveProfessionalView from "@/components/professional-intelligence/LiveProfessionalView";

export default async function LiveProfessionalPage({ params }: { params: Promise<{ professionalId: string }> }) {
  const { professionalId } = await params;
  return <LiveProfessionalView professionalId={professionalId} />;
}
