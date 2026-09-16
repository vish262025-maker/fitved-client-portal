// Creator-partner campaign pages (Instagram teaser -> landing page -> interest
// form -> WhatsApp community). Adding a new creator is adding an entry here,
// not writing new code — see src/pages/CreatorLanding.tsx, which is
// data-driven off this list.

export interface CreatorOption {
  value: string;
  label: string;
}

export interface CreatorCampaign {
  slug: string; // getfitved.com/<slug>
  creator: string; // stored on creator_leads.creator
  campaign: string; // stored on creator_leads.campaign
  creatorName: string;
  eyebrow: string; // e.g. "SWATI SINGH X FITVED"
  photoSrc: string; // public/ path, not a bundled import — swappable without a code change
  headline: string;
  subheading: string;
  body: string;
  bullets: string[];
  ctaLabel: string;
  captionUnderCta: string;
  whatsappLink: string;
  goalOptions: CreatorOption[]; // multi-select
  activityOptions: CreatorOption[]; // single-select
  successBody: string;
}

export const CREATOR_CAMPAIGNS: CreatorCampaign[] = [
  {
    slug: "mostlymumma",
    creator: "swati_singh",
    campaign: "mostlymumma",
    creatorName: "Swati Singh",
    eyebrow: "SWATI SINGH X FITVED",
    photoSrc: "/creators/mostlymumma-swati.jpg",
    headline: "Something exciting is coming.",
    subheading: "You asked. We're building it.",
    body: "Swati has been working with FitVed on something we've wanted to bring to the community for a while — something to make you stronger and fitter. We're not revealing everything just yet.",
    bullets: ["Guided by experts", "Workout together as a community"],
    ctaLabel: "Join the community",
    captionUnderCta: "Launching soon",
    whatsappLink: "https://chat.whatsapp.com/IBn2G9Vyzf10SlyQj93oCH?mode=gi_t",
    goalOptions: [
      { value: "lose_weight", label: "Lose weight" },
      { value: "get_in_shape", label: "Get in shape" },
      { value: "feel_stronger", label: "Feel stronger" },
      { value: "manage_pain", label: "Manage pain" },
    ],
    activityOptions: [
      { value: "mostly_walk", label: "Mostly walk" },
      { value: "gym", label: "I go to the gym" },
      { value: "home", label: "I do it at home" },
      { value: "not_really", label: "Not really — I don't have time" },
    ],
    successBody: "We'll share the details soon. Meanwhile, you can join the FitVed community now.",
  },
];

export function getCreatorCampaign(slug: string): CreatorCampaign | undefined {
  return CREATOR_CAMPAIGNS.find((c) => c.slug === slug);
}
