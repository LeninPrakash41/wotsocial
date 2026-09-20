/**
 * Default poster template library.
 *
 * A template is a layout contract, not a picture: it fixes what text slots
 * exist, how many words each can hold, and what the composition should do.
 * The Poster Art Director agent writes into those slots, so a batch of fifty
 * posters comes back varied in idea but consistent in shape — and every one
 * of them fits the layout it was written for.
 *
 * Customers can add their own; these are the ones every workspace starts with.
 */

export type PosterCategory =
  | 'awareness'
  | 'promotion'
  | 'education'
  | 'social-proof'
  | 'announcement'
  | 'recruitment';

export type PosterRatio = 'square' | 'portrait' | 'story' | 'landscape';

/**
 * The composition archetype, used to draw the thumbnail in the picker so a
 * marketer can see the shape of a layout before committing a batch to it.
 * It also tells the art director where the negative space has to be.
 */
export type PosterLayout =
  | 'centered'
  | 'split-horizontal'
  | 'split-vertical'
  | 'hero-number'
  | 'list'
  | 'quote'
  | 'product'
  | 'offer-badge'
  | 'editorial'
  | 'documentary';

export interface PosterSlot {
  key: string;
  label: string;
  maxWords: number;
  required: boolean;
}

export interface PosterTemplate {
  key: string;
  name: string;
  category: PosterCategory;
  /** What this poster is for, in the words a marketer would use. */
  brief: string;
  ratio: PosterRatio;
  layout: PosterLayout;
  slots: PosterSlot[];
  /** Handed to the agent verbatim as layout constraints. */
  constraints: string;
  /** Seeds the art direction so the batch stays visually coherent. */
  artDirection: string;
  /** Industries this tends to suit; used to order the picker, never to restrict it. */
  suitedTo: string[];
}

const SLOT = (key: string, label: string, maxWords: number, required = true): PosterSlot =>
  ({ key, label, maxWords, required });

export const POSTER_TEMPLATES: PosterTemplate[] = [
  {
    key: 'bold_statement',
    name: 'Bold Statement',
    category: 'awareness',
    brief: 'One strong claim, set large. The workhorse for building recognition.',
    ratio: 'square',
    layout: 'centered',
    slots: [SLOT('headline', 'Statement', 9), SLOT('subhead', 'Supporting line', 14, false)],
    constraints:
      'Headline is at most 9 words and must work at thumbnail size. Subhead is optional and at most 14 words. No body copy.',
    artDirection:
      'Full-bleed background with generous negative space in the upper two thirds for the headline. Single focal subject or an abstract brand-coloured field. High contrast, no busy detail behind the type.',
    suitedTo: ['saas', 'agency', 'consulting', 'fintech']
  },
  {
    key: 'problem_solution',
    name: 'Problem → Solution',
    category: 'awareness',
    brief: 'Names the frustration on top, answers it underneath. Reliably the highest-saving poster.',
    ratio: 'portrait',
    layout: 'split-horizontal',
    slots: [
      SLOT('headline', 'The problem', 10),
      SLOT('subhead', 'The answer', 12),
      SLOT('callToAction', 'Call to action', 4)
    ],
    constraints:
      'Headline states the reader\'s problem in at most 10 words. Subhead answers it in at most 12. CTA is at most 4 words.',
    artDirection:
      'Split composition: an unsettled, cooler upper half for the problem; a calm, brand-coloured lower half for the answer. Clear horizontal division.',
    suitedTo: ['saas', 'healthcare', 'fintech', 'consulting', 'education']
  },
  {
    key: 'stat_card',
    name: 'Single Statistic',
    category: 'social-proof',
    brief: 'One number, given the whole poster. Best when the figure is genuinely surprising.',
    ratio: 'square',
    layout: 'hero-number',
    slots: [
      SLOT('headline', 'The number', 3),
      SLOT('subhead', 'What it means', 14),
      SLOT('body', 'Source', 8, false)
    ],
    constraints:
      'Headline is the figure itself and at most 3 words, e.g. "4.8x ROAS". Subhead explains it in at most 14 words. Cite the source if one was supplied; never invent one.',
    artDirection:
      'The figure occupies the centre at extreme scale. Minimal background — a flat brand colour or a very soft gradient. Nothing competes with the number.',
    suitedTo: ['saas', 'fintech', 'agency', 'ecommerce', 'consulting']
  },
  {
    key: 'tip_list',
    name: 'Numbered Tips',
    category: 'education',
    brief: 'Three to five short, genuinely useful tips. The most saved and shared format.',
    ratio: 'portrait',
    layout: 'list',
    slots: [SLOT('headline', 'List title', 8), SLOT('body', 'The tips', 45)],
    constraints:
      'Headline is at most 8 words. Body contains 3 to 5 numbered tips, each at most 9 words. Every tip must be independently useful — no filler entries.',
    artDirection:
      'Clean editorial layout with a strong title band and clearly separated rows. Restrained palette so the text stays the subject.',
    suitedTo: ['saas', 'education', 'agency', 'health', 'consulting', 'real-estate']
  },
  {
    key: 'myth_buster',
    name: 'Myth vs Reality',
    category: 'education',
    brief: 'Corrects a belief your audience actually holds. Strong comment driver.',
    ratio: 'square',
    layout: 'split-horizontal',
    slots: [SLOT('headline', 'The myth', 10), SLOT('subhead', 'The reality', 14)],
    constraints:
      'Headline states a real, commonly held belief in at most 10 words. Subhead corrects it in at most 14. Do not strawman the myth.',
    artDirection:
      'Two stacked panels, visually opposed — the myth muted and desaturated, the reality in full brand colour.',
    suitedTo: ['health', 'fintech', 'education', 'consulting', 'legal']
  },
  {
    key: 'testimonial',
    name: 'Customer Quote',
    category: 'social-proof',
    brief: 'A real customer, in their own words. Only use quotes you actually have.',
    ratio: 'square',
    layout: 'quote',
    slots: [
      SLOT('body', 'The quote', 28),
      SLOT('subhead', 'Attribution', 8),
      SLOT('headline', 'Pull-out phrase', 5, false)
    ],
    constraints:
      'Quote is at most 28 words and must be supplied by the user — never fabricate a testimonial, a name or a company. If no quote was provided, skip this template.',
    artDirection:
      'Generous margins, a large opening quote mark, and space for a portrait or logo at the foot. Warm and human rather than corporate.',
    suitedTo: ['saas', 'agency', 'ecommerce', 'hospitality', 'real-estate', 'health']
  },
  {
    key: 'product_spotlight',
    name: 'Product Spotlight',
    category: 'promotion',
    brief: 'One product, its benefit and its price. The default for a catalogue.',
    ratio: 'square',
    layout: 'product',
    slots: [
      SLOT('headline', 'Benefit headline', 8),
      SLOT('subhead', 'Product name', 6),
      SLOT('body', 'Price or offer', 6, false),
      SLOT('callToAction', 'Call to action', 3)
    ],
    constraints:
      'Headline sells the benefit, not the feature, in at most 8 words. Only state a price or discount that was supplied.',
    artDirection:
      'Product held large and centred in a setting its buyer recognises. Soft directional light, uncluttered surface, brand colour in the ground rather than on the product.',
    suitedTo: ['ecommerce', 'retail', 'food', 'fashion', 'hospitality']
  },
  {
    key: 'limited_offer',
    name: 'Limited Offer',
    category: 'promotion',
    brief: 'A dated offer with a real deadline. Urgency only works when it is true.',
    ratio: 'portrait',
    layout: 'offer-badge',
    slots: [
      SLOT('headline', 'The offer', 7),
      SLOT('subhead', 'What is included', 12),
      SLOT('body', 'Deadline or terms', 10),
      SLOT('callToAction', 'Call to action', 3)
    ],
    constraints:
      'State only the offer, dates and terms supplied by the user. Never invent a deadline, a discount or scarcity.',
    artDirection:
      'High-energy composition with a clear offer badge. Brand accent used at full saturation — this is the one poster that should shout.',
    suitedTo: ['ecommerce', 'retail', 'food', 'hospitality', 'fitness', 'education']
  },
  {
    key: 'announcement',
    name: 'Announcement',
    category: 'announcement',
    brief: 'A launch, a feature or a milestone. Clear on what changed and what to do.',
    ratio: 'square',
    layout: 'centered',
    slots: [
      SLOT('headline', 'What is new', 8),
      SLOT('subhead', 'Why it matters', 14),
      SLOT('callToAction', 'Call to action', 4)
    ],
    constraints: 'Headline names the thing itself. Subhead explains the benefit, not the mechanics.',
    artDirection:
      'Centred, celebratory but restrained. A subtle burst or ribbon motif in the brand accent; keep the ground calm.',
    suitedTo: ['saas', 'fintech', 'agency', 'ecommerce', 'hospitality']
  },
  {
    key: 'before_after',
    name: 'Before / After',
    category: 'social-proof',
    brief: 'Shows the change rather than describing it. Strong for services with visible results.',
    ratio: 'square',
    layout: 'split-vertical',
    slots: [
      SLOT('headline', 'The transformation', 8),
      SLOT('subhead', 'The timeframe or method', 12),
      SLOT('body', 'The result', 10, false)
    ],
    constraints:
      'Only describe outcomes the user supplied. Never imply a typical result that was not evidenced.',
    artDirection:
      'Hard vertical split with matched framing on both sides so the change reads instantly. Identical lighting on each half.',
    suitedTo: ['fitness', 'health', 'beauty', 'real-estate', 'home-services', 'agency']
  },
  {
    key: 'founder_note',
    name: 'Founder Note',
    category: 'awareness',
    brief: 'A short, personal message. Builds trust in a way brand copy cannot.',
    ratio: 'portrait',
    layout: 'editorial',
    slots: [SLOT('headline', 'The opening line', 9), SLOT('body', 'The note', 45), SLOT('subhead', 'Signature', 6)],
    constraints:
      'Written in first person, plainly. No corporate hedging, no superlatives. At most 45 words in the body.',
    artDirection:
      'Warm, editorial and quiet. Space for a portrait at the foot. Feels like a letter, not an advertisement.',
    suitedTo: ['saas', 'agency', 'consulting', 'nonprofit', 'hospitality']
  },
  {
    key: 'event_promo',
    name: 'Event',
    category: 'announcement',
    brief: 'Webinar, workshop or launch event, with the details people need to attend.',
    ratio: 'portrait',
    layout: 'editorial',
    slots: [
      SLOT('headline', 'Event name', 8),
      SLOT('subhead', 'The promise', 12),
      SLOT('body', 'Date, time and place', 12),
      SLOT('callToAction', 'Call to action', 3)
    ],
    constraints: 'Only use the date, time, platform and speakers supplied. Never invent event details.',
    artDirection:
      'Poster-like hierarchy: title dominant, details in a clear block at the foot. Room for a speaker portrait.',
    suitedTo: ['saas', 'education', 'consulting', 'nonprofit', 'agency']
  },
  {
    key: 'faq_answer',
    name: 'Question & Answer',
    category: 'education',
    brief: 'Answers one question customers really ask. Cheap to produce, reliably useful.',
    ratio: 'square',
    layout: 'split-horizontal',
    slots: [SLOT('headline', 'The question', 12), SLOT('body', 'The answer', 30)],
    constraints:
      'The question must be one a real customer would ask in their own words, not marketing phrasing.',
    artDirection:
      'Simple two-part layout, question set as a heading and answer as body. Confident typography, minimal imagery.',
    suitedTo: ['saas', 'health', 'legal', 'fintech', 'education', 'real-estate']
  },
  {
    key: 'behind_scenes',
    name: 'Behind the Scenes',
    category: 'awareness',
    brief: 'How the work actually gets done. Humanises a brand that reads as faceless.',
    ratio: 'portrait',
    layout: 'documentary',
    slots: [SLOT('headline', 'The moment', 8), SLOT('body', 'What is happening', 30)],
    constraints: 'Describe a real, specific moment. Avoid generic team-photo language.',
    artDirection:
      'Documentary feel: candid framing, natural light, slight grain. Deliberately less polished than the rest of the set.',
    suitedTo: ['agency', 'food', 'hospitality', 'manufacturing', 'nonprofit', 'fashion']
  },
  {
    key: 'hiring',
    name: 'We Are Hiring',
    category: 'recruitment',
    brief: 'A role, the team and how to apply.',
    ratio: 'square',
    layout: 'centered',
    slots: [
      SLOT('headline', 'Role title', 6),
      SLOT('subhead', 'What they will do', 14),
      SLOT('body', 'Location and type', 8),
      SLOT('callToAction', 'How to apply', 4)
    ],
    constraints: 'Only list the role, location and terms supplied. Never invent salary or benefits.',
    artDirection:
      'Confident and open. Team imagery or workspace, brand colour as a strong border or band.',
    suitedTo: ['saas', 'agency', 'consulting', 'manufacturing', 'hospitality']
  },
  {
    key: 'comparison',
    name: 'This vs That',
    category: 'education',
    brief: 'Contrasts two approaches. Positions without naming a competitor.',
    ratio: 'square',
    layout: 'split-vertical',
    slots: [
      SLOT('headline', 'The comparison', 8),
      SLOT('subhead', 'Option A', 12),
      SLOT('body', 'Option B', 12)
    ],
    constraints:
      'Compare approaches or methods, never a named competitor. Be fair to the option you are arguing against.',
    artDirection: 'Symmetrical two-column layout, one side muted and one in brand colour.',
    suitedTo: ['saas', 'fintech', 'consulting', 'education', 'health']
  },
  {
    key: 'checklist',
    name: 'Checklist',
    category: 'education',
    brief: 'Something the reader can act on immediately. Very high save rate.',
    ratio: 'portrait',
    layout: 'list',
    slots: [SLOT('headline', 'Checklist title', 8), SLOT('body', 'The items', 40)],
    constraints: '4 to 6 items, each at most 7 words, each genuinely actionable.',
    artDirection: 'Clean list with tick marks, generous line spacing, one accent colour for the marks.',
    suitedTo: ['saas', 'consulting', 'education', 'health', 'real-estate', 'legal']
  },
  {
    key: 'quote_card',
    name: 'Industry Quote',
    category: 'awareness',
    brief: 'A quotable idea in your own voice. Good filler between campaign beats.',
    ratio: 'square',
    layout: 'quote',
    slots: [SLOT('body', 'The idea', 24), SLOT('subhead', 'Attribution', 6, false)],
    constraints:
      'Attribute only to the brand or a named person at the brand. Never attribute an invented quote to a real outside figure.',
    artDirection: 'Type-led. Large quote mark, wide margins, single flat brand colour.',
    suitedTo: ['agency', 'consulting', 'saas', 'nonprofit', 'fashion']
  },
  {
    key: 'seasonal',
    name: 'Seasonal Moment',
    category: 'promotion',
    brief: 'Ties the brand to a holiday or seasonal moment without being trite.',
    ratio: 'square',
    layout: 'centered',
    slots: [SLOT('headline', 'The greeting or hook', 8), SLOT('subhead', 'The brand connection', 14)],
    constraints:
      'Connect the moment to something the brand genuinely does. Avoid generic well-wishing with a logo attached.',
    artDirection:
      'Seasonal palette layered over the brand colours, never replacing them. Motif kept subtle.',
    suitedTo: ['ecommerce', 'retail', 'food', 'hospitality', 'fashion', 'fitness']
  },
  {
    key: 'case_result',
    name: 'Case Study Result',
    category: 'social-proof',
    brief: 'A client outcome with the number that proves it.',
    ratio: 'portrait',
    layout: 'hero-number',
    slots: [
      SLOT('headline', 'The result', 8),
      SLOT('subhead', 'Who and over what period', 12),
      SLOT('body', 'How it was done', 20),
      SLOT('callToAction', 'Call to action', 4)
    ],
    constraints:
      'Use only figures, client names and timeframes supplied. If the client cannot be named, say "a client in {industry}".',
    artDirection:
      'Result set large at the top, method in a quieter block beneath. Restrained, credible, closer to a report than an ad.',
    suitedTo: ['agency', 'saas', 'consulting', 'fintech', 'manufacturing']
  }
];

export const TEMPLATES_BY_KEY = new Map(POSTER_TEMPLATES.map(t => [t.key, t]));

/** Ranked for an industry, but never filtered — every template stays available. */
export const templatesForIndustry = (industry?: string): PosterTemplate[] => {
  if (!industry) return POSTER_TEMPLATES;
  const needle = industry.toLowerCase();
  return [...POSTER_TEMPLATES].sort((a, b) => {
    const aHit = a.suitedTo.some(s => needle.includes(s) || s.includes(needle)) ? 0 : 1;
    const bHit = b.suitedTo.some(s => needle.includes(s) || s.includes(needle)) ? 0 : 1;
    return aHit - bHit;
  });
};
