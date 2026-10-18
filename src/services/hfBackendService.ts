import { Client } from '@gradio/client';

const SPACE_URL = 'FelyaHuhing/qwen-image-21-uncensored';

export async function testToken(token: string): Promise<{ success: boolean; apiInfo?: any; error?: string }> {
  if (!token || !token.trim()) {
    return { success: false, error: 'Token is empty' };
  }

  try {
    const options: any = {};
    if (token && token.trim().length > 0) {
      options.token = token.trim();
    }
    const client = await Client.connect(SPACE_URL, { ...options, fetch: proxyFetch } as any);
    const apiInfo = await client.view_api();
    return { success: true, apiInfo: { named_endpoints: Object.keys(apiInfo.named_endpoints || {}) } };
  } catch (error: any) {
    console.error('Token test error:', error);
    return { success: false, error: error.message || 'Authentication failed' };
  }
}

export const proxyFetch = async (targetUrl: string, init?: RequestInit): Promise<Response> => {
  if (targetUrl.startsWith('data:')) {
    return await fetch(targetUrl, init);
  }
  if (targetUrl.includes('/api/hf-proxy')) {
    return await fetch(targetUrl, init);
  }
  const proxyUrl = `/api/hf-proxy?url=${encodeURIComponent(targetUrl)}`;
  return await fetch(proxyUrl, init);
};
