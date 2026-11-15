import { SharedAiClient } from '@/components/ai/SharedAiClient';

export const metadata = { title: 'Shared AI conversation · QUITIN' };

export default async function SharedAiPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SharedAiClient token={token} />;
}
