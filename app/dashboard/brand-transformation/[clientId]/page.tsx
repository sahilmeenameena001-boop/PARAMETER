import BrandTransformationDashboard from "@/components/brand-transformation/BrandTransformationDashboard";

export default async function BrandTransformationPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  return <BrandTransformationDashboard clientId={clientId} />;
}

