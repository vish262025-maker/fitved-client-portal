export interface AuthorDef {
  id: string;
  name: string;
  slug: string;
  avatarUrl: string;
  bio: string;
  credentials: string;
  expertise: string[];
}

export const AUTHORS_DATA: AuthorDef[] = [
  {
    id: "author-1",
    name: "Dr. Ananya Sharma, Ph.D.",
    slug: "dr-ananya-sharma",
    avatarUrl: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=200&q=80",
    bio: "Senior Sports Nutritionist & Clinical Dietitian with 12+ years of experience specializing in Indian diet formulation and metabolic health.",
    credentials: "Ph.D. Sports Nutrition, M.P.T. Rehabilitation",
    expertise: ["Nutrition", "PCOS", "Postpartum Rehab", "Indian Diets", "Diabetes"],
  },
  {
    id: "author-2",
    name: "Vikramaditya Verma",
    slug: "vikramaditya-verma",
    avatarUrl: "https://images.unsplash.com/photo-1567515004624-219c11d31f2e?w=200&q=80",
    bio: "Head Strength & Conditioning Coach at FitVed. Certified CSCS and former national powerlifter.",
    credentials: "NSCA-CSCS, Certified Master Trainer",
    expertise: ["Strength Training", "Hypertrophy", "Home Workouts", "Mobility"],
  },
  {
    id: "author-3",
    name: "Meera Kulkarni",
    slug: "meera-kulkarni",
    avatarUrl: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=200&q=80",
    bio: "Lead Yoga Instructor & Mindfulness Coach focusing on prenatal/postnatal care and holistic stress management.",
    credentials: "RYT-500 Yoga Alliance Certified",
    expertise: ["Yoga", "Breathwork", "Prenatal", "Mindfulness", "Women's Health"],
  },
];
