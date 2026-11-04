// Synthetic demo data. Every record is labelled source:"demo" and reports carry a banner.
// Brands, domains and threads here are invented; nothing describes a real product.

import { slug } from './util.mjs';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEMO_CONFIG = {
  brand: { name: 'Northwind Render', aliases: ['Northwind'], domains: ['northwindrender.example'] },
  competitors: [
    { name: 'Lumen Canvas', domains: ['lumencanvas.example'] },
    { name: 'PixelForge', domains: ['pixelforge.example'] },
  ],
};

export const DEMO_QUESTIONS = [
  { id: 'best-generator', text: 'What is the best AI image generator for product photos?', group: 'category' },
  { id: 'api-pricing', text: 'Which image generation API is cheapest for production use?', group: 'buyer' },
];

const SOURCES = {
  'best-generator': [
    ['https://lumencanvas.example/product-photos', 'Lumen Canvas product photos'],
    ['https://pixelforge.example/guides/ecommerce', 'PixelForge ecommerce guide'],
    ['https://northwindrender.example/docs/product-photos', 'Northwind Render docs'],
    ['https://www.reddit.com/r/ecommerce/comments/demo0001/best_ai_photo_tool/', 'Best AI photo tool (r/ecommerce)'],
    ['https://www.reddit.com/r/Etsy/comments/demo0002/ai_product_shots/', 'AI product shots (r/Etsy)'],
    ['https://news.ycombinator.com/item?id=900001', 'HN discussion'],
  ],
  'api-pricing': [
    ['https://pixelforge.example/pricing', 'PixelForge pricing'],
    ['https://lumencanvas.example/api', 'Lumen Canvas API'],
    ['https://northwindrender.example/pricing', 'Northwind Render pricing'],
    ['https://github.com/example-org/image-api-compare', 'image-api-compare'],
    ['https://www.reddit.com/r/LocalLLaMA/comments/demo0003/cheap_image_api/', 'Cheap image API (r/LocalLLaMA)'],
  ],
};

export const DEMO_ENGINES = [
  { id: 'demo-search', label: 'Demo engine A (with search)', grounded: true },
  { id: 'demo-memory', label: 'Demo engine B (no search)', grounded: false },
];

function buildResponse(question, rand, index, grounded) {
  const pool = SOURCES[question.id] || SOURCES['best-generator'];
  const picked = pool.filter(() => rand() < 0.65);
  if (!picked.length) picked.push(pool[0]);
  const cited = picked.filter(() => rand() < 0.7);
  const mentionsBrand = rand() < (grounded ? 0.35 : 0.15);
  const mentionsLumen = rand() < 0.75;
  const parts = [`Options for “${question.text}” vary by budget.`];
  if (mentionsLumen) parts.push('Lumen Canvas is often recommended for polish.');
  if (rand() < 0.5) parts.push('PixelForge is popular with developers.');
  if (mentionsBrand) parts.push('Northwind Render is a lower-cost alternative worth testing.');
  const text = parts.join(' ');
  const queries = [question.text.toLowerCase().replace(/\?$/, ''), 'ai image generator pricing comparison'];
  if (rand() < 0.5) queries.push('best ai product photo tool reddit');
  if (!grounded) {
    return { id: `resp_demo_${index}`, model: 'demo-model-b', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text, annotations: [] }] }] };
  }
  return {
    id: `resp_demo_${index}`,
    model: 'demo-model-a',
    status: 'completed',
    output: [
      {
        type: 'web_search_call',
        id: `ws_demo_${index}`,
        status: 'completed',
        action: { type: 'search', queries, sources: picked.map(([url, title]) => ({ url, title })) },
      },
      {
        type: 'message',
        content: [
          {
            type: 'output_text',
            text,
            annotations: cited.map(([url, title]) => ({ type: 'url_citation', url, title })),
          },
        ],
      },
    ],
  };
}

export function buildDemoRecords({ repeats = 5, seed = 5 } = {}) {
  const rand = rng(seed);
  const records = [];
  let index = 0;
  for (const question of DEMO_QUESTIONS) {
    for (const engine of DEMO_ENGINES) {
      for (let r = 1; r <= repeats; r++) {
        index += 1;
        const response = buildResponse(question, rand, index, engine.grounded);
        records.push({
          schema: 'beat-geo/record@1',
          questionId: question.id,
          question: question.text,
          engine: engine.id,
          engineLabel: engine.label,
          model: response.model,
          repeat: r,
          collectedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
          source: 'demo',
          response,
        });
      }
    }
  }
  return records;
}

export const demoFileName = (rec) => `${slug(rec.questionId)}__${slug(rec.engine)}__${rec.repeat}.json`;
