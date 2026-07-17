// Optional image captioning. When a key is present, one vision Messages call turns an uploaded
// inspiration photo into a short, shopping-relevant phrase — used as the image element's description
// and the visual-search label. With no key, describe is unavailable and the UI asks the shopper to
// describe the image themselves (LLD §11 floor: the zero-key clone still works, just without AI text).
import { generateText } from 'ai';
import { intentModel, hasKey } from './provider.js';

const SYSTEM = [
  'You caption a travel-inspiration photo for a shopping assistant.',
  'Reply with ONE short phrase (max 12 words) describing what is shown and its style or setting —',
  'e.g. "sun-bleached linen beachwear on a rocky Mediterranean coast".',
  'No preamble, no quotation marks, no price, brand, or stock claims.',
].join(' ');

export interface DescribeResult {
  available: boolean;
  description?: string;
}

export async function describeImage(contentType: string, data: string): Promise<DescribeResult> {
  if (!hasKey) return { available: false };
  const { text } = await generateText({
    model: intentModel,
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this inspiration image in one short phrase.' },
          { type: 'image', image: `data:${contentType};base64,${data}` },
        ],
      },
    ],
  });
  return { available: true, description: text.trim().replace(/^["']+|["']+$/g, '') };
}
