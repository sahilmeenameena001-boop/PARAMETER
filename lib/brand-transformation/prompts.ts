import type { BrandToken } from "@/types/brand-transformation";

export function buildCreativePrompt(input: {
  clientName: string;
  positioning: string;
  content: { headline: string; accent?: string; standfirst?: string; body?: string; footer?: string };
  tokens: BrandToken[];
  format?: string;
}) {
  const approved = input.tokens.filter((token) => token.status === "approved");
  const rules = approved.map((token) => `- ${token.token_type}/${token.name}: ${JSON.stringify(token.value)}`).join("\n");
  return [
    `Create one ${input.format || "1080x1350px portrait"} editorial creative for ${input.clientName}.`,
    `POSITIONING: ${input.positioning}`,
    "APPROVED BRAND RULES — mandatory:",
    rules || "- No approved tokens supplied; stop and request brand approval.",
    "CONTENT — reproduce accurately:",
    `Headline: ${input.content.headline}`,
    input.content.accent ? `Accent: ${input.content.accent}` : "",
    input.content.standfirst ? `Standfirst: ${input.content.standfirst}` : "",
    input.content.body ? `Body: ${input.content.body}` : "",
    input.content.footer ? `Footer: ${input.content.footer}` : "",
    "COMPLIANCE: Do not invent colours, fonts, logos, claims or visual styles outside the approved rules.",
  ].filter(Boolean).join("\n\n");
}

