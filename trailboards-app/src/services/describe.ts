// Same-origin call to the optional image-captioning endpoint. When the server has no API key it
// returns { available:false } and the inspiration card asks the shopper to describe the image
// themselves. A network/parse failure is treated the same way — describe is never load-bearing.
export interface DescribeResult {
  available: boolean;
  description?: string;
}

export async function describeImage(contentType: string, data: string): Promise<DescribeResult> {
  try {
    const res = await fetch('/api/describe-image', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contentType, data }),
    });
    if (!res.ok) return { available: false };
    return (await res.json()) as DescribeResult;
  } catch {
    return { available: false };
  }
}
