// Entirely fictional records. Never replace these with customer data.
export type PreviewProfile = {
  id: string;
  kind: "SYNTHETIC";
  name: string;
  age: number;
  location: string;
  occupation: string;
  education: string;
  portrait: string;
  interests: readonly string[];
  values: readonly string[];
  goal: string;
  communication: string;
  bio: string;
};

export const profiles: readonly PreviewProfile[] = [
  { id: "aanya", kind: "SYNTHETIC", name: "Aanya", age: 31, location: "Bengaluru", occupation: "Product designer", education: "Master's in design", portrait: "/demo/portraits/aanya.webp", interests: ["Art", "Hiking", "Coffee"], values: ["Kindness", "Curiosity", "Family"], goal: "Long-term partnership", communication: "Thoughtful & direct", bio: "An early morning trail, a small art gallery, and a long conversation over coffee. Looking for a thoughtful partnership with room to keep growing." },
  { id: "ishaan", kind: "SYNTHETIC", name: "Ishaan", age: 34, location: "Bengaluru", occupation: "Architect", education: "Bachelor's in architecture", portrait: "/demo/portraits/ishaan.webp", interests: ["Architecture", "Hiking", "Cooking"], values: ["Kindness", "Family", "Creativity"], goal: "Long-term partnership", communication: "Warm & collaborative", bio: "Usually planning a weekend walk or trying a new recipe. Values an easy sense of humor, honest conversations, and building a life together." },
  { id: "lina", kind: "SYNTHETIC", name: "Lina", age: 30, location: "Mumbai", occupation: "Creative strategist", education: "Bachelor's in communication", portrait: "/demo/portraits/lina.webp", interests: ["Art", "Reading", "Travel"], values: ["Independence", "Curiosity", "Honesty"], goal: "Long-term partnership", communication: "Open & expressive", bio: "A curious mind with a soft spot for bookshops and coastal weekends. Enjoys people who make everyday life feel a little more interesting." },
  { id: "omar", kind: "SYNTHETIC", name: "Omar", age: 36, location: "Mumbai", occupation: "Education consultant", education: "Master's in education", portrait: "/demo/portraits/omar.webp", interests: ["Reading", "Cooking", "Travel"], values: ["Kindness", "Curiosity", "Community"], goal: "Long-term partnership", communication: "Patient & reflective", bio: "A good listener, enthusiastic home cook, and lifelong learner. Hopes to share a grounded, generous partnership and a few new adventures." },
];

export type FactorExample = { name: string; score: number | null };
export type MatchExample = { id: string; source: PreviewProfile; candidate: PreviewProfile; score: number; completeness: number; summary: string; factors: readonly FactorExample[] };

// Fixed presentation examples, not calculated scores or recommendations.
export const matchExamples: readonly MatchExample[] = [
  { id: "example-one", source: profiles[0], candidate: profiles[1], score: 89, completeness: 88, summary: "In this fictional example, shared kindness and family values, similar relationship goals, and a love of the outdoors create useful conversation starters. Communication preferences would deserve a closer look.", factors: [{ name: "Interests", score: 84 }, { name: "Values", score: 94 }, { name: "Location", score: 100 }, { name: "Age", score: 90 }, { name: "Lifestyle", score: 86 }, { name: "Goals", score: 95 }, { name: "Education", score: null }, { name: "Communication", score: 78 }] },
  { id: "example-two", source: profiles[0], candidate: profiles[3], score: 82, completeness: 65, summary: "This fictional pairing illustrates shared curiosity and kindness with different cities and less complete preference information. The missing information matters; the example score is not a prediction.", factors: [{ name: "Interests", score: 72 }, { name: "Values", score: 91 }, { name: "Location", score: 40 }, { name: "Age", score: 82 }, { name: "Lifestyle", score: null }, { name: "Goals", score: 95 }, { name: "Education", score: null }, { name: "Communication", score: 84 }] },
];

export const workflowSteps = ["Select Customer", "Review Matches", "Read Explanation", "Generate Email", "Choose Delivery"] as const;

export const sampleDraft = {
  subject: "A thoughtful introduction for you, Aanya",
  body: "Hi Aanya,\n\nI wanted to share an introduction that may be worth exploring. Ishaan also enjoys the outdoors and values kindness, family, and building a thoughtful long-term partnership.\n\nThere is more to a connection than a few shared interests. If this introduction feels interesting to you, we can talk through what you would like to know before taking a next step.\n\nWarmly,\nAvery\n\n[Synthetic preview — not an actual introduction]",
};

export const sampleMessages = [
  { role: "user", text: "What should I look at first in Aanya and Ishaan's example?" },
  { role: "assistant", text: "In this scripted example, start with their shared values and relationship goals. Then explore how their communication styles might work together. The illustrative score cannot tell you whether a relationship will succeed." },
  { role: "user", text: "Could an introduction mention their shared love of the outdoors?" },
  { role: "assistant", text: "That could be a useful conversation starter in a draft. Any real profile processing would need consent, and every outgoing introduction would need your explicit approval." },
] as const;

export const sampleWeights = [{ name: "Values", value: 20 }, { name: "Goals", value: 20 }, { name: "Interests", value: 15 }, { name: "Lifestyle", value: 15 }, { name: "Communication", value: 10 }, { name: "Location", value: 10 }, { name: "Age", value: 5 }, { name: "Education", value: 5 }] as const;
