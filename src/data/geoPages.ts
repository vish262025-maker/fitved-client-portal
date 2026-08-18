// Data-driven geo landing page content.
// Each page is keyed by its URL path (e.g. "/personal-trainer/bangalore").
// The GeoLandingPage component reads this data and renders a full landing page.

export interface GeoFAQ {
  q: string;
  a: string;
}

export interface GeoSection {
  heading: string;
  body: string;
}

export interface GeoPageData {
  title: string;
  h1: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  heroSubtitle: string;
  intro: string;
  sections: GeoSection[];
  benefits: string[];
  tips: string[];
  mistakes: string[];
  faqs: GeoFAQ[];
  relatedBlogSlugs: string[];
  relatedGeoLinks: { label: string; href: string }[];
  ctaText: string;
  breadcrumbs: { name: string; url: string }[];
  category: "personal-trainer" | "yoga" | "strength" | "corporate-wellness" | "specialty" | "calculator" | "comparison" | "online";
  city?: string;
  area?: string;
}

// ── Location metadata ──────────────────────────────────────────────────────────
const CITY_META: Record<string, { population: string; itHub?: boolean; avgCost: string; topAreas: string[]; lang: string[]; climate: string }> = {
  bangalore: { population: "1.3 crore", itHub: true, avgCost: "Rs 2,500–6,000/month", topAreas: ["HSR Layout", "Koramangala", "Whitefield", "Indiranagar", "Bellandur"], lang: ["English", "Kannada", "Hindi"], climate: "year-round pleasant weather ideal for outdoor training" },
  mumbai: { population: "2.1 crore", avgCost: "Rs 4,000–10,000/month", topAreas: ["Bandra", "BKC", "Powai", "Andheri", "Lower Parel"], lang: ["English", "Hindi", "Marathi"], climate: "humid tropical climate requiring indoor or early-morning sessions" },
  "delhi-ncr": { population: "3.2 crore", itHub: true, avgCost: "Rs 2,000–8,000/month", topAreas: ["Gurgaon", "Noida", "South Delhi", "Dwarka", "Greater Noida"], lang: ["English", "Hindi"], climate: "extreme seasonal variation — indoor training preferred in summer and winter" },
  pune: { population: "75 lakh", itHub: true, avgCost: "Rs 2,000–5,000/month", topAreas: ["Hinjewadi", "Kharadi", "Baner", "Koregaon Park", "Wakad"], lang: ["English", "Hindi", "Marathi"], climate: "moderate climate with pleasant winters ideal for outdoor fitness" },
  hyderabad: { population: "1 crore", itHub: true, avgCost: "Rs 2,000–5,000/month", topAreas: ["Gachibowli", "HITEC City", "Banjara Hills", "Jubilee Hills"], lang: ["English", "Hindi", "Telugu"], climate: "warm climate favouring early morning and evening workouts" },
  chennai: { population: "1.1 crore", avgCost: "Rs 2,000–5,000/month", topAreas: ["OMR", "Velachery", "T Nagar", "Adyar", "Anna Nagar"], lang: ["English", "Tamil", "Hindi"], climate: "hot and humid — air-conditioned or early morning sessions recommended" },
  kolkata: { population: "1.5 crore", avgCost: "Rs 1,500–4,000/month", topAreas: ["Salt Lake", "New Town", "Park Street"], lang: ["English", "Bengali", "Hindi"], climate: "hot summers and mild winters — parks ideal for outdoor training Oct–Mar" },
  ahmedabad: { population: "80 lakh", avgCost: "Rs 1,500–4,000/month", topAreas: ["SG Highway", "Prahlad Nagar", "Satellite"], lang: ["English", "Gujarati", "Hindi"], climate: "hot dry climate — indoor training preferred Apr–Sep" },
  gurgaon: { population: "30 lakh", itHub: true, avgCost: "Rs 3,000–8,000/month", topAreas: ["Cyber City", "Golf Course Road", "Sector 56–57", "DLF Phase 1–4"], lang: ["English", "Hindi"], climate: "extreme summers and winters — year-round indoor training" },
  noida: { population: "25 lakh", itHub: true, avgCost: "Rs 2,000–5,000/month", topAreas: ["Sector 18", "Sector 62", "Sector 137", "Noida Extension"], lang: ["English", "Hindi"], climate: "extreme seasonal variation" },
};

// Helper to create breadcrumbs
function bc(items: { name: string; url: string }[]): { name: string; url: string }[] {
  return [{ name: "Home", url: "/" }, ...items];
}

// ── Builder functions ──────────────────────────────────────────────────────────

function personalTrainerCity(city: string, displayCity: string): GeoPageData {
  const meta = CITY_META[city.toLowerCase()] || { population: "", avgCost: "Rs 2,000–6,000/month", topAreas: [], lang: ["English", "Hindi"], climate: "" };
  return {
    title: `Personal Trainer in ${displayCity}`,
    h1: `Find a Certified Personal Trainer in ${displayCity}`,
    metaTitle: `Personal Trainer in ${displayCity} — Home Training | FitVed`,
    metaDescription: `Book a certified personal trainer in ${displayCity} for at-home fitness, weight loss, strength training, and yoga. Police-verified coaches. Free trial session.`,
    keywords: [`personal trainer ${displayCity.toLowerCase()}`, `home trainer ${displayCity.toLowerCase()}`, `fitness trainer ${displayCity.toLowerCase()}`, "personal training near me", "at home personal trainer", "certified personal trainer", "weight loss trainer", "fitness coach India"],
    heroSubtitle: `FitVed brings police-verified, certified personal trainers to your doorstep in ${displayCity}. Whether you want to lose weight, build strength, or improve flexibility — train at home with expert guidance.`,
    intro: `${displayCity} is home to ${meta.population || "millions of"} residents, many of whom struggle to find time for the gym between work, commute, and family. A personal trainer who comes to your home or society eliminates every excuse. FitVed's trainers in ${displayCity} are background-checked, certified, and experienced across weight loss, muscle building, yoga, rehabilitation, and senior fitness. With ${meta.climate}, a customised at-home program adapts to your schedule and environment.`,
    sections: [
      { heading: `Why Choose a Personal Trainer in ${displayCity}?`, body: `A gym membership averages Rs 1,500–3,000/month but has 70–80% drop-off rates within 3 months. A personal trainer costs ${meta.avgCost} but delivers 3–5x better results because of individualised programming, accountability, and form correction. In ${displayCity}, where ${meta.itHub ? "the IT and corporate workforce sits 10–12 hours daily" : "busy professionals have limited free time"}, a trainer who arrives at your door at 6 AM or 7 PM makes fitness non-negotiable.` },
      { heading: "What to Expect from FitVed Trainers", body: "Every FitVed trainer undergoes a multi-step verification: police background check, certification validation, practical fitness assessment, and client feedback reviews. Your first session is a free trial — the trainer assesses your fitness level, discusses goals, and designs a personalised program. Sessions are 45–60 minutes, 3–6 days per week, at your home, society park, or terrace." },
      { heading: "Programs Available", body: `Weight loss and fat reduction. Strength and muscle building. Yoga (Hatha, Vinyasa, Power). Prenatal and postnatal fitness. Senior fitness (55+). Rehabilitation and physiotherapy-guided exercise. Sports conditioning. Functional training and mobility. Diet and nutrition coaching.` },
      { heading: `Training Areas in ${displayCity}`, body: meta.topAreas.length ? `FitVed trainers are active across ${displayCity}'s key residential areas: ${meta.topAreas.join(", ")}, and more. We cover societies, apartments, independent houses, and villa communities. If you live in ${displayCity}, we likely have a trainer within 5 km of you.` : `FitVed trainers cover major residential areas across ${displayCity}. We serve societies, apartments, and independent houses.` },
      { heading: "How Pricing Works", body: `Personal training in ${displayCity} typically costs ${meta.avgCost} depending on frequency (3–6 days/week), session duration, and trainer specialisation. FitVed offers transparent pricing with no hidden fees. Your trial session is completely free — no payment, no card, no commitment.` },
      { heading: "Results You Can Expect", body: "With consistent training (4+ sessions/week) and nutrition guidance: 3–5 kg fat loss in the first month. Measurable strength gains within 6 weeks. Improved flexibility and pain reduction in 2–3 weeks. Better sleep and energy from week 1. Our trainers track your progress with monthly assessments including body measurements, strength benchmarks, and photos." },
    ],
    benefits: [
      "Police-verified and certified trainers at your doorstep",
      "Free trial session — no payment, no commitment",
      "Customised programming for your specific goals",
      "Flexible scheduling — morning, evening, or weekend",
      "Progress tracking with monthly assessments",
      "Nutrition guidance included with most plans",
      `Trainers fluent in ${meta.lang.join(", ")}`,
      "No gym required — equipment provided or bodyweight programs",
    ],
    tips: [
      "Start with a clear, measurable goal — '5 kg in 8 weeks' beats 'get fit'",
      "Be honest with your trainer about injuries, medications, and lifestyle",
      "Consistency beats intensity — 4 moderate sessions outperform 2 hard ones",
      "Follow the nutrition guidance — training accounts for only 30% of results",
      "Give a new program at least 4 weeks before judging its effectiveness",
    ],
    mistakes: [
      "Choosing a trainer based only on price — credentials and experience matter more",
      "Skipping the free trial — chemistry and communication style are crucial",
      "Expecting results without dietary changes — abs are built in the kitchen",
      "Training 7 days without rest — muscles grow during recovery, not training",
      "Comparing your progress to social media transformations — many are misleading",
    ],
    faqs: [
      { q: `How much does a personal trainer cost in ${displayCity}?`, a: `Personal training in ${displayCity} ranges from ${meta.avgCost} for 3–6 sessions per week. FitVed offers a free trial so you can experience a session before committing.` },
      { q: "Are FitVed trainers certified?", a: "Yes. Every FitVed trainer holds a recognised fitness certification (ACE, ACSM, NSCA, or equivalent Indian certifications) and undergoes police verification and background checks." },
      { q: "Can I train at home without gym equipment?", a: "Absolutely. Our trainers design effective bodyweight programs. For advanced training, they bring resistance bands, dumbbells, and mats. No gym membership needed." },
      { q: "What if I don't like my trainer after the trial?", a: "We assign a different trainer at no extra cost. Trainer-client compatibility is important to us — we want you to enjoy your sessions." },
      { q: "How soon will I see results?", a: "Most clients notice improved energy and sleep within 1 week. Visible body composition changes typically appear in 3–4 weeks with consistent training and nutrition adherence." },
      { q: `Do you offer online training for ${displayCity} residents?`, a: "Yes. FitVed offers both at-home and online personal training. Online sessions are conducted via video call with real-time form correction." },
    ],
    relatedBlogSlugs: [
      "science-based-indian-weight-loss-diet-for-beginners-in-india",
      "top-high-protein-foods-for-muscle-building-in-india",
      "best-home-workout-routine-for-busy-professionals-in-india",
    ],
    relatedGeoLinks: meta.topAreas.slice(0, 4).map(a => ({
      label: `Personal Trainer in ${a}`,
      href: `/personal-trainer/${city.toLowerCase()}/${a.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    })),
    ctaText: `Book a Free Trial Session in ${displayCity}`,
    breadcrumbs: bc([
      { name: "Personal Trainer", url: "/personal-trainer/bangalore" },
      { name: displayCity, url: `/personal-trainer/${city.toLowerCase()}` },
    ]),
    category: "personal-trainer",
    city: displayCity,
  };
}

function personalTrainerArea(city: string, displayCity: string, area: string, displayArea: string): GeoPageData {
  const base = personalTrainerCity(city, displayCity);
  return {
    ...base,
    title: `Personal Trainer in ${displayArea}, ${displayCity}`,
    h1: `Personal Trainer in ${displayArea}, ${displayCity}`,
    metaTitle: `Personal Trainer in ${displayArea} ${displayCity} — Home Training | FitVed`,
    metaDescription: `Certified personal trainers in ${displayArea}, ${displayCity}. At-home fitness, weight loss, yoga & strength training. Police-verified. Free trial.`,
    heroSubtitle: `Get a certified, police-verified personal trainer at your doorstep in ${displayArea}, ${displayCity}. Customised fitness programs for weight loss, strength, yoga, and more.`,
    intro: `${displayArea} is one of ${displayCity}'s most sought-after residential areas, and FitVed has certified personal trainers actively serving societies, apartments, and independent homes here. Whether you live in a high-rise apartment or a gated community, our trainers reach you — no gym commute, no crowded facilities, just focused 1-on-1 training designed for your goals.`,
    sections: [
      ...base.sections.slice(0, 2),
      { heading: `Training in ${displayArea}`, body: `Our trainers in ${displayArea} are familiar with the local layout — they train clients in society parks, rooftops, building gyms, and living rooms. Morning slots (5:30–8 AM) are most popular with working professionals, while evening slots (5–8 PM) suit homemakers and remote workers. Weekend sessions are available for those with unpredictable weekday schedules.` },
      ...base.sections.slice(3),
    ],
    faqs: [
      { q: `Is a personal trainer available in ${displayArea}?`, a: `Yes. FitVed has multiple active trainers in ${displayArea}, ${displayCity}. Book a free trial and we'll assign the nearest available trainer.` },
      ...base.faqs.slice(1),
    ],
    relatedGeoLinks: [
      { label: `Personal Trainer in ${displayCity}`, href: `/personal-trainer/${city.toLowerCase()}` },
      ...base.relatedGeoLinks.filter(l => !l.label.includes(displayArea)).slice(0, 3),
    ],
    ctaText: `Book a Free Trial in ${displayArea}`,
    breadcrumbs: bc([
      { name: "Personal Trainer", url: "/personal-trainer/bangalore" },
      { name: displayCity, url: `/personal-trainer/${city.toLowerCase()}` },
      { name: displayArea, url: `/personal-trainer/${city.toLowerCase()}/${area}` },
    ]),
    area: displayArea,
  };
}

function yogaCity(city: string, displayCity: string): GeoPageData {
  const meta = CITY_META[city.toLowerCase()] || { population: "", avgCost: "Rs 2,000–5,000/month", topAreas: [], lang: ["English", "Hindi"], climate: "" };
  return {
    title: `Online Yoga Classes ${displayCity}`,
    h1: `Online & At-Home Yoga Classes in ${displayCity}`,
    metaTitle: `Yoga Classes in ${displayCity} — Online & Home | FitVed`,
    metaDescription: `Join online and at-home yoga classes in ${displayCity}. Hatha, Vinyasa, Power Yoga, Prenatal yoga. Certified instructors. First session free.`,
    keywords: [`yoga classes ${displayCity.toLowerCase()}`, `yoga trainer ${displayCity.toLowerCase()}`, `online yoga ${displayCity.toLowerCase()}`, "hatha yoga", "vinyasa yoga", "prenatal yoga", "yoga at home", "yoga instructor near me"],
    heroSubtitle: `Experience yoga the way it was meant to be — personalised, 1-on-1, at your own pace. FitVed's certified yoga instructors bring authentic practice to your home or screen in ${displayCity}.`,
    intro: `Yoga is India's greatest wellness export, yet many in ${displayCity} settle for overcrowded studio classes where individual alignment is impossible. FitVed offers a different approach: personal yoga instruction at home or online, tailored to your body, flexibility level, and health conditions. Whether you're a complete beginner or want to deepen an advanced practice, our instructors adapt every session to you.`,
    sections: [
      { heading: "Yoga Styles We Offer", body: "Hatha Yoga — foundational postures and breathwork for beginners and intermediate practitioners. Vinyasa Flow — dynamic, breath-linked sequences for cardiovascular fitness and flexibility. Power Yoga — strength-focused practice for athletic conditioning. Yin Yoga — deep, sustained stretches targeting fascia and joint mobility. Restorative Yoga — gentle, supported poses for stress relief and recovery. Pranayama and Meditation — standalone breathwork and mindfulness sessions." },
      { heading: "Who Benefits Most", body: "Desk workers with chronic back pain, neck stiffness, and poor posture. Women managing PCOS, thyroid issues, or menstrual irregularities. Pregnant women seeking safe prenatal exercise. Seniors wanting to maintain mobility and prevent falls. Athletes needing flexibility and recovery work. Anyone seeking stress relief and better sleep." },
      { heading: `Why At-Home Yoga in ${displayCity}`, body: `Studio classes in ${displayCity} run on fixed schedules — miss the 7 AM slot and you're out of options. Home yoga fits around your life: 5:30 AM for early risers, 10 AM for homemakers, 7 PM for professionals. Your instructor adjusts the practice to your space, whether it's a spacious living room, a small balcony, or a society terrace.` },
      { heading: "Online Yoga Sessions", body: "For those preferring virtual practice, FitVed offers live 1-on-1 online yoga via video call. Your instructor watches your alignment in real-time and provides verbal and visual corrections. Online sessions are ideal for NRIs, remote workers, or anyone who wants expert guidance without an in-person visit." },
      { heading: "What a Session Looks Like", body: "Every session is 45–60 minutes. It begins with centering and breathwork (5 minutes), moves to warm-up sequences (10 minutes), the main practice with postures suited to your level (25–35 minutes), and closes with savasana and meditation (5–10 minutes). Your instructor brings a mat and props — blocks, straps, bolsters — if needed." },
    ],
    benefits: [
      "1-on-1 attention — every posture corrected for your body",
      "Flexible scheduling — morning, afternoon, or evening",
      "All styles: Hatha, Vinyasa, Power, Prenatal, Restorative",
      "Certified instructors with yoga therapy training",
      "Safe practice for health conditions — PCOS, back pain, pregnancy",
      "No studio commute — saves 30–60 minutes daily",
      "Equipment provided (mat, blocks, straps)",
      "Free trial session to assess compatibility",
    ],
    tips: [
      "Practice on an empty stomach — wait 2 hours after a heavy meal",
      "Wear comfortable, stretchy clothing — no zippers or belts",
      "Inform your instructor about injuries, surgeries, or pregnancy",
      "Consistency matters more than duration — 30 minutes daily beats 90 minutes twice a week",
      "Hydrate well before practice but avoid drinking during the session",
    ],
    mistakes: [
      "Following random YouTube sequences without understanding alignment",
      "Pushing through pain — yoga should stretch, never strain",
      "Comparing your flexibility to others — every body is different",
      "Skipping breathwork — pranayama is half of yoga's benefit",
      "Treating yoga as only physical exercise — the mental benefits require present-moment awareness",
    ],
    faqs: [
      { q: "Can complete beginners join?", a: "Absolutely. FitVed instructors regularly work with people who have never done yoga. We start with basic postures, breathing, and flexibility assessment." },
      { q: "Is yoga safe during pregnancy?", a: "Yes, with a trained prenatal yoga instructor. FitVed has certified prenatal yoga specialists who modify every posture for each trimester." },
      { q: "How is personal yoga different from studio classes?", a: "A studio class follows one sequence for 20–30 people. Personal yoga is designed entirely for your body, health conditions, and goals. Every posture is corrected in real-time." },
      { q: `How much do yoga classes cost in ${displayCity}?`, a: `Personal yoga sessions in ${displayCity} range from ${meta.avgCost}. FitVed offers a free first session with no commitment required.` },
      { q: "Can yoga help with back pain?", a: "Yes. Therapeutic yoga is one of the most effective non-pharmaceutical interventions for chronic lower back pain, supported by extensive clinical research." },
    ],
    relatedBlogSlugs: [
      "best-home-workout-routine-for-busy-professionals-in-india",
      "science-based-indian-weight-loss-diet-for-beginners-in-india",
    ],
    relatedGeoLinks: [
      { label: `Personal Trainer in ${displayCity}`, href: `/personal-trainer/${city.toLowerCase()}` },
      { label: `Prenatal Yoga ${displayCity}`, href: `/prenatal-yoga/${city.toLowerCase()}` },
    ],
    ctaText: `Book a Free Yoga Trial in ${displayCity}`,
    breadcrumbs: bc([
      { name: "Yoga", url: "/yoga/mumbai" },
      { name: displayCity, url: `/yoga/${city.toLowerCase()}` },
    ]),
    category: "yoga",
    city: displayCity,
  };
}

function strengthCity(city: string, displayCity: string): GeoPageData {
  const meta = CITY_META[city.toLowerCase()] || { avgCost: "Rs 2,500–6,000/month", topAreas: [], lang: ["English", "Hindi"] };
  return {
    title: `Strength Training ${displayCity}`,
    h1: `Online & At-Home Strength Training in ${displayCity}`,
    metaTitle: `Strength Training Coach ${displayCity} — Build Muscle | FitVed`,
    metaDescription: `Build muscle and strength with a certified coach in ${displayCity}. Personalised strength programs, progressive overload, nutrition guidance. Free trial.`,
    keywords: [`strength training ${displayCity.toLowerCase()}`, `muscle building ${displayCity.toLowerCase()}`, `gym trainer ${displayCity.toLowerCase()}`, "strength coach", "weight training", "muscle gain", "vegetarian muscle building", "home strength training"],
    heroSubtitle: `Build real, lasting strength with a certified strength coach in ${displayCity}. Progressive programming, proper form coaching, and nutrition guidance — at your home or online.`,
    intro: `Strength training is the single most impactful form of exercise for long-term health — it builds muscle, strengthens bones, improves insulin sensitivity, and reverses age-related decline. Yet most people in ${displayCity} either avoid it (fearing injury) or do it wrong (copying gym influencers). A qualified strength coach eliminates both problems. FitVed's coaches in ${displayCity} design progressive, periodised programs that build real strength safely.`,
    sections: [
      { heading: "What Strength Training Includes", body: "Compound movements: squats, deadlifts, bench press, overhead press, rows, pull-ups. Accessory work: targeted exercises for lagging muscle groups. Mobility and warm-up protocols to prevent injury. Progressive overload: systematic increases in weight, reps, or volume. Periodisation: structured training phases (strength, hypertrophy, deload) to prevent plateaus." },
      { heading: "Who Benefits from Strength Training", body: "Everyone. Specifically: desk workers needing posture correction and back pain relief. Women wanting to tone without bulk (physiologically impossible without steroids). Men wanting to build muscle and lose fat simultaneously. Seniors preventing sarcopenia (age-related muscle loss). Athletes improving sports performance. Anyone wanting to boost metabolism — muscle burns 3x more calories than fat at rest." },
      { heading: "Vegetarian Muscle Building", body: `A common concern in ${displayCity}: 'Can I build muscle on a vegetarian diet?' Absolutely. Indian vegetarian foods like paneer (18g protein/100g), soya chunks (52g/100g), dal-rice combinations, curd, eggs, and whey provide complete protein. Our coaches design nutrition plans using Indian vegetarian staples that hit 1.6–2.2 g/kg protein — the range proven to maximise muscle growth.` },
      { heading: "Training at Home vs Gym", body: "Home training with minimal equipment (dumbbells, resistance bands, a pull-up bar) is enough for 80% of people's strength goals. FitVed coaches bring equipment or use bodyweight progressions. For advanced lifters wanting barbell training, we can train you at your society gym or a local gym of your choice." },
      { heading: "Expected Results", body: "Beginners: 2–4 kg muscle gain in first 3 months (with proper nutrition). Intermediate: 1–2 kg muscle gain per 3 months. Strength: most people double their major lifts within 6–12 months. Body composition: visible changes in 4–6 weeks with consistent training and nutrition." },
    ],
    benefits: [
      "Certified strength coaches with proven results",
      "Progressive programming — no random workouts",
      "Nutrition guidance for muscle building (vegetarian options available)",
      "Form coaching to prevent injuries",
      "Monthly progress tracking with strength benchmarks",
      "Home or online sessions — no gym required",
      "Free trial session",
    ],
    tips: [
      "Focus on compound lifts — they build the most muscle per time invested",
      "Progressive overload is non-negotiable — if you're not gradually increasing load, you're not growing",
      "Eat enough protein — 1.6–2.2 g/kg body weight daily for muscle building",
      "Sleep 7–9 hours — muscle growth happens during recovery, not training",
      "Track your workouts — what gets measured gets improved",
    ],
    mistakes: [
      "Training the same muscles daily without rest — muscles need 48–72 hours to recover",
      "Chasing pump over progressive overload — the pump fades, strength is permanent",
      "Avoiding heavy compound lifts for fear of getting 'too big' — it takes years of deliberate effort",
      "Neglecting legs — lower body has the largest muscle groups and drives the most metabolic benefit",
      "Copying advanced lifter routines — beginners need simpler, high-frequency programs",
    ],
    faqs: [
      { q: "Can I build muscle at home without a gym?", a: "Yes. Bodyweight exercises, resistance bands, and adjustable dumbbells are enough for most people. Our coaches design effective home programs." },
      { q: "Will strength training make women bulky?", a: "No. Women produce 10–20x less testosterone than men. Strength training creates a toned, firm physique — not bulk." },
      { q: "How many days per week should I train?", a: "3–4 days for most people. Full-body or upper/lower splits provide optimal stimulus with adequate recovery." },
      { q: "Can vegetarians build muscle?", a: "Absolutely. With paneer, soya, dal, eggs, curd, and whey, Indian vegetarians can hit 100–150g protein daily — more than enough for muscle growth." },
      { q: `How much does a strength coach cost in ${displayCity}?`, a: `Strength coaching in ${displayCity} ranges from ${meta.avgCost} for 3–6 sessions per week. FitVed offers a free trial session.` },
    ],
    relatedBlogSlugs: [
      "top-high-protein-foods-for-muscle-building-in-india",
      "science-based-indian-weight-loss-diet-for-beginners-in-india",
    ],
    relatedGeoLinks: [
      { label: `Personal Trainer in ${displayCity}`, href: `/personal-trainer/${city.toLowerCase()}` },
      { label: `Vegetarian Muscle Building ${displayCity}`, href: `/vegetarian-muscle-building/${city.toLowerCase()}` },
    ],
    ctaText: `Book a Free Strength Training Trial in ${displayCity}`,
    breadcrumbs: bc([
      { name: "Strength Training", url: "/strength-training/bangalore" },
      { name: displayCity, url: `/strength-training/${city.toLowerCase()}` },
    ]),
    category: "strength",
    city: displayCity,
  };
}

function corporateWellnessPage(variant: string, displayName: string): GeoPageData {
  const isCity = !["india", "yoga", "employee-fitness"].includes(variant);
  return {
    title: `Corporate Wellness ${displayName}`,
    h1: `Corporate Wellness Programs ${isCity ? "in " : "— "}${displayName}`,
    metaTitle: `Corporate Wellness ${displayName} | FitVed`,
    metaDescription: `Corporate wellness programs ${isCity ? "in " : "for "}${displayName}. On-site fitness, yoga, ergonomics, and nutrition workshops for employees. Reduce healthcare costs.`,
    keywords: ["corporate wellness program", "employee fitness", "office yoga", "workplace wellness", "corporate fitness", `corporate wellness ${displayName.toLowerCase()}`, "employee health program", "on-site fitness"],
    heroSubtitle: `Transform your workplace health with FitVed's corporate wellness programs. On-site trainers, group fitness sessions, nutrition workshops, and ergonomic assessments — designed to reduce absenteeism and boost productivity.`,
    intro: `Indian companies lose an estimated Rs 40,000–60,000 per employee annually to absenteeism, presenteeism, and health-related productivity loss. Corporate wellness programs have shown 25–30% reduction in sick days and 15–20% improvement in employee engagement. FitVed brings certified fitness professionals directly to your office — no employee commute needed, maximum participation guaranteed.`,
    sections: [
      { heading: "Programs We Offer", body: "On-site Personal Training: 1-on-1 or small-group sessions at your office gym or conference room. Group Yoga: chair yoga, desk stretches, guided meditation for stress management. Fitness Bootcamps: high-energy group sessions for team building. Nutrition Workshops: practical sessions on healthy eating, meal prep, reading food labels. Ergonomic Assessments: workstation evaluations to prevent RSI, back pain, and eye strain. Health Challenges: step challenges, weight-loss challenges, fitness competitions." },
      { heading: "The Business Case", body: "Johnson & Johnson's wellness program saved $250 million over a decade — $2.71 for every $1 spent. SAS Institute found that on-site fitness reduced turnover to 4% vs industry average of 20%. Indian data shows similar patterns: Infosys and Wipro both report reduced health insurance claims after implementing structured wellness programs. FitVed provides ROI tracking and participation metrics for every engagement." },
      { heading: "How It Works", body: "Step 1: Discovery call — we understand your workforce size, demographics, and health challenges. Step 2: Custom proposal — programs tailored to your team's needs, budget, and facilities. Step 3: Trainer assignment — certified professionals matched to your requirements. Step 4: Implementation — sessions begin within 1 week of approval. Step 5: Reporting — monthly participation, feedback, and health metrics reports." },
      { heading: "Flexible Formats", body: "Before-work sessions (7–9 AM): yoga, stretching, meditation. Lunch-hour sessions (12–1 PM): 30-minute express workouts, chair yoga. After-work sessions (5–7 PM): group bootcamps, strength training. Virtual sessions: for remote and hybrid teams. Workshop days: monthly nutrition, sleep, or stress-management seminars." },
    ],
    benefits: [
      "25–30% reduction in employee sick days",
      "Improved focus and productivity — 15–20% average gain",
      "Lower health insurance premiums over time",
      "Better employee retention — wellness is a top-5 perk",
      "Team building through group fitness activities",
      "Customised programs for your workforce demographics",
      "Monthly reports with participation and satisfaction data",
      "No employee commute — trainers come to your office",
    ],
    tips: [
      "Start with a health survey to understand employee needs",
      "Offer variety — yoga, strength, nutrition — to appeal to different preferences",
      "Leadership participation drives 40% higher employee engagement",
      "Schedule sessions during work hours for maximum attendance",
      "Track metrics from day 1 — data justifies budget renewals",
    ],
    mistakes: [
      "Offering gym memberships instead of on-site programs — utilisation drops below 15%",
      "One-size-fits-all approach — a 25-year-old engineer and a 50-year-old manager need different programs",
      "Treating wellness as a one-time event — sustainable change requires ongoing engagement",
      "Ignoring mental health — stress management and meditation should be core offerings",
      "Not measuring results — if you can't show ROI, the budget gets cut",
    ],
    faqs: [
      { q: "What is the minimum team size for corporate wellness?", a: "FitVed works with teams of 10 to 10,000+. Programs are scaled to your size — from a single weekly session to daily multi-program offerings." },
      { q: "Do you provide trainers for remote teams?", a: "Yes. Virtual yoga, fitness, and meditation sessions via video conferencing for distributed teams." },
      { q: "How much does a corporate wellness program cost?", a: "Pricing depends on frequency, team size, and program scope. Entry-level programs start at Rs 30,000/month. Contact us for a custom quote." },
      { q: "Can you work with our existing office gym?", a: "Absolutely. Our trainers use whatever facilities are available — from fully equipped gyms to empty conference rooms." },
    ],
    relatedBlogSlugs: [
      "best-home-workout-routine-for-busy-professionals-in-india",
      "science-based-indian-weight-loss-diet-for-beginners-in-india",
    ],
    relatedGeoLinks: [
      { label: "Corporate Wellness India", href: "/corporate-wellness/india" },
      { label: "Office Yoga Programs", href: "/corporate-wellness/yoga" },
    ],
    ctaText: "Get a Corporate Wellness Quote",
    breadcrumbs: bc([
      { name: "Corporate Wellness", url: "/corporate-wellness/india" },
      { name: displayName, url: `/corporate-wellness/${variant}` },
    ]),
    category: "corporate-wellness",
    city: isCity ? displayName : undefined,
  };
}

function comparisonPage(slug: string, competitor: string): GeoPageData {
  const competitorData: Record<string, { desc: string; priceRange: string; model: string; pros: string[]; cons: string[] }> = {
    "Cult.fit": { desc: "a tech-driven fitness platform offering group classes at branded centres", priceRange: "Rs 800–2,500/month", model: "Group classes at Cult centres, online classes via app", pros: ["Affordable group classes", "Many locations in metros", "App-based booking"], cons: ["No personalised attention", "Fixed schedules", "No home training"] },
    "Cure.fit": { desc: "the earlier brand name of Cult.fit with similar offerings", priceRange: "Rs 800–2,500/month", model: "Group classes at centres, online classes", pros: ["Brand recognition", "Variety of class types", "Technology-driven"], cons: ["One-size-fits-all classes", "No customisation", "No home visits"] },
    "Cult Pass Live": { desc: "Cult.fit's online group fitness streaming platform", priceRange: "Rs 500–1,500/month", model: "Live-streamed group classes via app", pros: ["Train from home", "Affordable", "Variety of classes"], cons: ["No personalisation", "No form correction", "Group format"] },
    "HealthifyMe": { desc: "a calorie-counting and diet coaching app with optional trainer access", priceRange: "Rs 1,500–6,000/month", model: "App-based diet tracking, optional human coaching", pros: ["Good calorie tracking app", "Diet plans", "AI-powered recommendations"], cons: ["Primarily diet-focused", "Limited exercise guidance", "Coaching is app-based, not in-person"] },
    "Fittr": { desc: "a fitness coaching marketplace connecting users with online coaches", priceRange: "Rs 5,000–15,000 per program", model: "Online coaching via app, coach marketplace", pros: ["Large coach network", "Customised plans", "Progress tracking"], cons: ["Online only — no in-person", "Quality varies by coach", "Expensive for premium coaches"] },
    "Anytime Fitness": { desc: "a 24/7 gym franchise with locations across Indian metros", priceRange: "Rs 2,000–5,000/month", model: "Gym membership with optional personal training", pros: ["24/7 access", "Equipment variety", "Multiple locations"], cons: ["You train alone unless you pay extra for PT", "Still requires commute", "Crowded peak hours"] },
    "Gym Membership": { desc: "a traditional gym or fitness centre membership", priceRange: "Rs 1,000–4,000/month", model: "Access to gym equipment and group classes", pros: ["Affordable", "Equipment access", "Social environment"], cons: ["70-80% dropout within 3 months", "No guidance", "Commute time"] },
  };
  const comp = competitorData[competitor] || { desc: "a competing fitness service", priceRange: "varies", model: "varies", pros: ["Established brand"], cons: ["Limited personalisation"] };

  return {
    title: `Personal Trainer vs ${competitor}`,
    h1: `Personal Trainer vs ${competitor} — Which Is Better for You?`,
    metaTitle: `Personal Trainer vs ${competitor} Comparison | FitVed`,
    metaDescription: `Honest comparison: personal trainer vs ${competitor}. Costs, results, personalisation, convenience. Which fitness approach delivers better results?`,
    keywords: [`personal trainer vs ${competitor.toLowerCase()}`, `${competitor.toLowerCase()} review`, `${competitor.toLowerCase()} vs personal trainer`, "best fitness option India", "personal trainer comparison", "fitness app vs personal trainer"],
    heroSubtitle: `${competitor} is ${comp.desc}. A personal trainer provides 1-on-1, customised coaching at your home. Here's an honest comparison to help you decide.`,
    intro: `Both options can work — the right choice depends on your goals, budget, and preferences. This comparison covers pricing, personalisation, convenience, results, and who each option suits best. We'll be honest about where ${competitor} excels and where a personal trainer delivers more value.`,
    sections: [
      { heading: "Cost Comparison", body: `${competitor} costs approximately ${comp.priceRange}. A personal trainer with FitVed costs Rs 2,500–6,000/month for 3–6 weekly sessions. Per session, a personal trainer costs more — but per result, the value equation often favours personalised coaching because adherence rates are 3–4x higher.` },
      { heading: `What ${competitor} Offers`, body: `${comp.model}. Pros: ${comp.pros.join(". ")}. Cons: ${comp.cons.join(". ")}.` },
      { heading: "What a Personal Trainer Offers", body: "1-on-1 customised programming designed for your specific body, goals, and health conditions. Real-time form correction preventing injuries. Accountability — your trainer arrives at your door, so skipping is harder. Nutrition guidance personalised to your diet. Progress tracking with measurable benchmarks." },
      { heading: "Who Should Choose What", body: `Choose ${competitor} if: you're self-motivated, enjoy group energy, want affordability, and have a clear idea of what exercises to do. Choose a personal trainer if: you want guaranteed results, need customised programming (injuries, health conditions, specific goals), value convenience (home training), or have struggled with gym consistency in the past.` },
      { heading: "The Hybrid Approach", body: `Many people combine both: a personal trainer 3x/week for structured strength work and form coaching, plus ${competitor} or a gym for additional cardio and flexibility sessions. This gives you the best of both worlds — expert guidance plus variety and community.` },
    ],
    benefits: [
      "100% personalised programming vs one-size-fits-all",
      "3–4x higher adherence rates than gym or group classes",
      "Real-time form correction preventing injuries",
      "No commute — trainer comes to you",
      "Nutrition guidance included",
      "Flexible scheduling around your life",
    ],
    tips: [
      "Try both before committing — most offer trial sessions or passes",
      "Be honest about your self-discipline level when choosing",
      "Calculate total cost including commute time (Rs 100–200 per gym trip in most metros)",
      "Ask for before/after evidence from real clients, not marketing photos",
    ],
    mistakes: [
      "Choosing based solely on price — the cheapest option is worthless if you stop going after 2 months",
      "Assuming group classes provide personalised attention — they can't with 20+ participants",
      "Believing marketing claims without checking real client results",
      "Not using the free trial to test compatibility and quality",
    ],
    faqs: [
      { q: `Is a personal trainer worth the extra cost over ${competitor}?`, a: `If your primary goal is specific results (weight loss target, muscle building, pain management), a personal trainer delivers significantly faster, measurable outcomes. If your goal is general activity and social fitness, ${competitor} may be sufficient.` },
      { q: `Can I switch from ${competitor} to a personal trainer?`, a: "Absolutely. Many FitVed clients have switched from group fitness or gym memberships after hitting plateaus or struggling with consistency." },
      { q: "Is FitVed biased in this comparison?", a: "We are a personal training company, so naturally we believe in our service. But we've tried to present an honest comparison. For some people, group fitness is genuinely the better choice — and we respect that." },
    ],
    relatedBlogSlugs: [
      "best-home-workout-routine-for-busy-professionals-in-india",
    ],
    relatedGeoLinks: [
      { label: "Personal Trainer Bangalore", href: "/personal-trainer/bangalore" },
      { label: "Online Personal Trainer India", href: "/online-personal-trainer/india" },
    ],
    ctaText: "Try a Free Personal Training Session",
    breadcrumbs: bc([
      { name: "Comparisons", url: "/compare/personal-trainer-vs-cultfit" },
      { name: `vs ${competitor}`, url: `/compare/${slug}` },
    ]),
    category: "comparison",
  };
}

function calculatorPage(slug: string, name: string, desc: string): GeoPageData {
  return {
    title: name,
    h1: name,
    metaTitle: `${name} — Free Online Tool | FitVed`,
    metaDescription: desc,
    keywords: [name.toLowerCase(), `${name.toLowerCase()} online`, `${name.toLowerCase()} India`, "health calculator", "fitness calculator", "free online calculator"],
    heroSubtitle: desc,
    intro: `Use our free ${name.toLowerCase()} to get personalised health insights. For the most accurate results, combine calculator outputs with guidance from a certified fitness professional.`,
    sections: [
      { heading: `How the ${name} Works`, body: `This calculator uses evidence-based formulas to provide accurate estimates. Enter your details below to get your personalised result. Remember that calculators provide estimates — individual metabolism, genetics, and lifestyle factors create variation. Use the result as a starting point, then adjust based on real-world progress.` },
      { heading: "Why This Matters", body: `Understanding your body metrics is the foundation of any effective fitness plan. Without knowing your baseline numbers, you're guessing — and guessing leads to frustration. Whether you're trying to lose weight, build muscle, or maintain health, data-driven decisions produce better outcomes.` },
    ],
    benefits: [
      "Free and instant results",
      "Evidence-based formulas",
      "No login or email required",
      "Mobile-friendly interface",
    ],
    tips: [
      "Use this calculator as a starting point, not a final answer",
      "Recheck every 4–6 weeks as your body changes",
      "Combine multiple calculators for a complete picture",
      "Consult a trainer or nutritionist for personalised interpretation",
    ],
    mistakes: [
      "Treating calculator results as exact — they are estimates with 10–15% variance",
      "Not accounting for activity level changes",
      "Using results from one calculator in isolation",
    ],
    faqs: [
      { q: `Is the ${name.toLowerCase()} accurate?`, a: "It uses validated scientific formulas and provides estimates within 10–15% of actual values. For precise measurements, consult a healthcare professional." },
      { q: "Do I need to create an account?", a: "No. The calculator is free to use with no login required." },
    ],
    relatedBlogSlugs: [
      "science-based-indian-weight-loss-diet-for-beginners-in-india",
    ],
    relatedGeoLinks: [
      { label: "BMI Calculator", href: "/bmi-calculator" },
      { label: "Calorie Calculator", href: "/calorie-calculator" },
      { label: "TDEE Calculator", href: "/tdee-calculator" },
      { label: "Macro Calculator", href: "/macro-calculator" },
    ],
    ctaText: "Get Expert Guidance from a FitVed Trainer",
    breadcrumbs: bc([
      { name: "Calculators", url: "/blog/calculators" },
      { name: name, url: `/${slug}` },
    ]),
    category: "calculator",
  };
}

function specialtyPage(slug: string, title: string, description: string, introText: string, sections: GeoSection[], faqList: GeoFAQ[]): GeoPageData {
  return {
    title,
    h1: title,
    metaTitle: `${title} | FitVed`,
    metaDescription: description,
    keywords: title.toLowerCase().split(/[\s—–,]+/).filter(w => w.length > 2).concat(["fitness coach", "personal trainer", "FitVed"]),
    heroSubtitle: description,
    intro: introText,
    sections,
    benefits: [
      "Certified specialists with condition-specific expertise",
      "Personalised programming — not generic templates",
      "At-home or online sessions for convenience",
      "Coordination with your medical team when needed",
      "Free trial session to assess fit",
      "Evidence-based approach backed by clinical research",
    ],
    tips: [
      "Share your medical reports and medication list with your coach",
      "Start slow and build gradually — consistency over intensity",
      "Track symptoms alongside fitness metrics for a complete picture",
      "Communicate any discomfort immediately during sessions",
    ],
    mistakes: [
      "Following generic fitness advice that doesn't account for your condition",
      "Stopping medication because you're exercising — always consult your doctor",
      "Expecting overnight results — chronic conditions require sustained effort",
      "Avoiding all exercise because of your condition — supervised movement usually helps",
    ],
    faqs: faqList,
    relatedBlogSlugs: [
      "science-based-indian-weight-loss-diet-for-beginners-in-india",
    ],
    relatedGeoLinks: [
      { label: "Personal Trainer Bangalore", href: "/personal-trainer/bangalore" },
      { label: "Online Personal Trainer India", href: "/online-personal-trainer/india" },
    ],
    ctaText: "Book a Free Consultation",
    breadcrumbs: bc([
      { name: title, url: `/${slug.split("/").slice(0, -1).join("/")}` },
    ]),
    category: "specialty",
  };
}

// ── Page registry ──────────────────────────────────────────────────────────────
// Maps URL path -> page data. Uses builder functions to avoid 10,000-line repetition.

export function getGeoPageData(path: string): GeoPageData | null {
  // Normalise: remove trailing slash, lowercase
  const p = path.replace(/\/$/, "").toLowerCase();

  // ── Personal Trainer city pages ─────────────────────────────────────────────
  const ptCityMap: Record<string, string> = {
    "/personal-trainer/bangalore": "Bangalore",
    "/personal-trainer/mumbai": "Mumbai",
    "/personal-trainer/delhi-ncr": "Delhi NCR",
    "/personal-trainer/pune": "Pune",
    "/personal-trainer/hyderabad": "Hyderabad",
    "/personal-trainer/chennai": "Chennai",
    "/personal-trainer/kolkata": "Kolkata",
    "/personal-trainer/ahmedabad": "Ahmedabad",
    "/personal-trainer/gurgaon": "Gurgaon",
    "/personal-trainer/noida": "Noida",
    "/personal-trainer/greater-noida": "Greater Noida",
    "/personal-trainer/faridabad": "Faridabad",
    "/personal-trainer/jaipur": "Jaipur",
    "/personal-trainer/lucknow": "Lucknow",
    "/personal-trainer/chandigarh": "Chandigarh",
    "/personal-trainer/indore": "Indore",
    "/personal-trainer/coimbatore": "Coimbatore",
    "/personal-trainer/kochi": "Kochi",
    "/personal-trainer/thiruvananthapuram": "Thiruvananthapuram",
    "/personal-trainer/bhubaneswar": "Bhubaneswar",
    "/personal-trainer/guwahati": "Guwahati",
    "/personal-trainer/nagpur": "Nagpur",
    "/personal-trainer/visakhapatnam": "Visakhapatnam",
    "/personal-trainer/mysore": "Mysore",
    "/personal-trainer/mangalore": "Mangalore",
    "/personal-trainer/surat": "Surat",
    "/personal-trainer/vadodara": "Vadodara",
    "/personal-trainer/usa-nri": "USA (NRI)",
    "/personal-trainer/usa/indian-americans": "USA Indian Americans",
    "/personal-trainer/usa/texas": "Texas (NRI)",
    "/personal-trainer/usa/new-jersey": "New Jersey (NRI)",
    "/personal-trainer/usa/bay-area": "Bay Area (NRI)",
    "/personal-trainer/uk": "United Kingdom",
    "/personal-trainer/canada": "Canada",
    "/personal-trainer/australia": "Australia",
    "/personal-trainer/dubai": "Dubai",
    "/personal-trainer/abu-dhabi": "Abu Dhabi",
    "/personal-trainer/singapore": "Singapore",
    "/personal-trainer/germany": "Germany",
  };
  if (ptCityMap[p]) {
    const city = p.split("/").pop()!;
    return personalTrainerCity(city, ptCityMap[p]);
  }

  // ── Personal Trainer area pages ─────────────────────────────────────────────
  const ptAreaMatch = p.match(/^\/personal-trainer\/([^/]+)\/([^/]+)$/);
  if (ptAreaMatch) {
    const [, citySlug, areaSlug] = ptAreaMatch;
    const cityDisplay = ptCityMap[`/personal-trainer/${citySlug}`];
    if (cityDisplay || citySlug === "delhi" || citySlug === "usa") {
      const areaDisplay = areaSlug
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      const parentCity = citySlug === "delhi" ? "Delhi NCR" : citySlug === "usa" ? "USA (NRI)" : (cityDisplay || areaDisplay);
      return personalTrainerArea(citySlug, parentCity, areaSlug, areaDisplay);
    }
  }

  // ── Deeper nesting (usa/bay-area/cupertino, usa/new-jersey/edison, uk/london, etc.)
  const ptDeepMatch = p.match(/^\/personal-trainer\/([^/]+)\/([^/]+)\/([^/]+)$/);
  if (ptDeepMatch) {
    const [, country, region, areaSlug] = ptDeepMatch;
    const areaDisplay = areaSlug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    const regionDisplay = region.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    return personalTrainerArea(country, `${regionDisplay}, ${country.toUpperCase()}`, areaSlug, areaDisplay);
  }

  // ── Yoga pages ──────────────────────────────────────────────────────────────
  const yogaCities: Record<string, string> = {
    "/yoga/mumbai": "Mumbai", "/yoga/delhi-ncr": "Delhi NCR", "/yoga/pune": "Pune",
    "/yoga/kolkata": "Kolkata", "/yoga/gurgaon": "Gurgaon", "/yoga/noida": "Noida",
    "/yoga/usa-nri": "USA (NRI)", "/yoga/nri": "NRIs Worldwide",
  };
  if (yogaCities[p]) return yogaCity(p.split("/").pop()!, yogaCities[p]);

  // Yoga area pages
  const yogaAreaMatch = p.match(/^\/yoga\/([^/]+)\/([^/]+)$/);
  if (yogaAreaMatch) {
    const [, citySlug, areaSlug] = yogaAreaMatch;
    const base = yogaCity(citySlug, yogaCities[`/yoga/${citySlug}`] || citySlug.charAt(0).toUpperCase() + citySlug.slice(1));
    const areaDisplay = areaSlug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    return { ...base, title: `Online Yoga ${areaDisplay}`, h1: `Yoga Classes in ${areaDisplay}`, metaTitle: `Yoga Classes ${areaDisplay} | FitVed`, area: areaDisplay };
  }

  // ── Strength training pages ─────────────────────────────────────────────────
  const strengthCities: Record<string, string> = {
    "/strength-training/bangalore": "Bangalore", "/strength-training/mumbai": "Mumbai",
    "/strength-training/delhi-ncr": "Delhi NCR", "/strength-training/pune": "Pune",
    "/strength-training/kolkata": "Kolkata", "/strength-training/usa-nri": "USA (NRI)",
    "/strength-training/noida": "Noida",
  };
  if (strengthCities[p]) return strengthCity(p.split("/").pop()!, strengthCities[p]);

  const strengthAreaMatch = p.match(/^\/strength-training\/([^/]+)\/([^/]+)$/);
  if (strengthAreaMatch) {
    const [, citySlug, areaSlug] = strengthAreaMatch;
    const base = strengthCity(citySlug, strengthCities[`/strength-training/${citySlug}`] || citySlug.charAt(0).toUpperCase() + citySlug.slice(1));
    const areaDisplay = areaSlug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    return { ...base, title: `Strength Coach ${areaDisplay}`, h1: `Strength Training Coach in ${areaDisplay}`, metaTitle: `Strength Coach ${areaDisplay} | FitVed`, area: areaDisplay };
  }

  // ── Vegetarian muscle building ──────────────────────────────────────────────
  const vegCities: Record<string, string> = {
    "/vegetarian-muscle-building/bangalore": "Bangalore", "/vegetarian-muscle-building/mumbai": "Mumbai",
    "/vegetarian-muscle-building/delhi-ncr": "Delhi NCR", "/vegetarian-muscle-building/pune": "Pune",
    "/vegetarian-muscle-building/usa": "USA (NRI)",
  };
  if (vegCities[p]) {
    const base = strengthCity(p.split("/").pop()!, vegCities[p]);
    return { ...base, title: `Vegetarian Muscle Building ${vegCities[p]}`, h1: `Vegetarian Muscle Building in ${vegCities[p]}`, metaTitle: `Vegetarian Muscle Building ${vegCities[p]} | FitVed`, metaDescription: `Build muscle on a vegetarian Indian diet in ${vegCities[p]}. Expert coaching, personalised protein plans, progressive training. Free trial.` };
  }

  // ── Corporate Wellness ──────────────────────────────────────────────────────
  const cwMap: Record<string, string> = {
    "/corporate-wellness/india": "India", "/corporate-wellness/bangalore": "Bangalore",
    "/corporate-wellness/mumbai": "Mumbai", "/corporate-wellness/delhi-ncr": "Delhi NCR",
    "/corporate-wellness/pune": "Pune", "/corporate-wellness/hyderabad": "Hyderabad",
    "/corporate-wellness/chennai": "Chennai", "/corporate-wellness/yoga": "Office Yoga",
    "/corporate-wellness/employee-fitness": "Employee Fitness",
  };
  if (cwMap[p]) return corporateWellnessPage(p.split("/").pop()!, cwMap[p]);

  // ── Comparisons ─────────────────────────────────────────────────────────────
  const compMap: Record<string, string> = {
    "/compare/personal-trainer-vs-cultfit": "Cult.fit",
    "/compare/personal-trainer-vs-curefit": "Cure.fit",
    "/compare/personal-trainer-vs-cult-pass-live": "Cult Pass Live",
    "/compare/personal-trainer-vs-healthifyme": "HealthifyMe",
    "/compare/personal-trainer-vs-fittr": "Fittr",
    "/compare/personal-trainer-vs-anytime-fitness": "Anytime Fitness",
    "/compare/personal-trainer-vs-gym-membership": "Gym Membership",
  };
  if (compMap[p]) return comparisonPage(p.replace("/compare/", ""), compMap[p]);

  // ── Calculators ─────────────────────────────────────────────────────────────
  const calcMap: Record<string, [string, string]> = {
    "/bmi-calculator": ["BMI Calculator India", "Calculate your Body Mass Index using the WHO formula. Understand what your BMI means for Indian body types and health risk."],
    "/calorie-calculator": ["Calorie Calculator India", "Calculate your daily calorie needs based on age, weight, height, and activity level. Customised for Indian diets."],
    "/macro-calculator": ["Macro Calculator India", "Calculate your ideal protein, carb, and fat split based on your goals — weight loss, muscle gain, or maintenance."],
    "/ideal-weight-calculator": ["Ideal Weight Calculator India", "Find your ideal body weight based on height, frame size, and age. Calibrated for Indian body types."],
    "/tdee-calculator": ["TDEE Calculator India", "Calculate your Total Daily Energy Expenditure — the exact number of calories you burn daily including exercise."],
    "/daily-calorie-burn-calculator": ["Daily Calorie Burn Calculator", "Estimate how many calories you burn daily based on your activities, exercise, and metabolic rate."],
  };
  if (calcMap[p]) return calculatorPage(p.replace(/^\//, ""), calcMap[p][0], calcMap[p][1]);

  // ── Specialty pages ─────────────────────────────────────────────────────────
  const specialtyMap: Record<string, () => GeoPageData> = {
    "/online-personal-trainer/india": () => specialtyPage("online-personal-trainer/india", "Online Personal Trainer India", "Train with India's best certified personal trainers from anywhere. Live video sessions with real-time form correction.", "Online personal training eliminates geography. Whether you're in a metro or a tier-2 city, in India or abroad, FitVed's certified trainers deliver 1-on-1 sessions via video call with real-time form correction, customised programming, and nutrition guidance.", [
      { heading: "How Online Training Works", body: "You connect with your trainer via Zoom or Google Meet at your scheduled time. The trainer watches your form in real-time, counts reps, corrects posture, and motivates you through the session. You receive your weekly program in advance so you can set up equipment. Sessions are 45–60 minutes, 3–6 days per week." },
      { heading: "Who It's For", body: "Professionals in cities without quality trainers. NRIs wanting Indian fitness and nutrition expertise. Remote workers with flexible schedules. People who prefer training at home. Those in tier-2/3 cities without access to certified trainers." },
      { heading: "Equipment Needed", body: "Minimum: a clear floor space of 6x8 feet, a phone or laptop with camera, and a yoga mat. Recommended: a set of adjustable dumbbells and resistance bands. Optional: a pull-up bar. Most effective programs can be designed with minimal equipment." },
    ], [
      { q: "Is online training as effective as in-person?", a: "For most goals (weight loss, general fitness, flexibility), online training delivers comparable results. For advanced powerlifting or sports-specific training, in-person coaching may be preferred." },
      { q: "What if my internet connection is poor?", a: "We recommend minimum 5 Mbps for stable video. If connection drops, trainers can switch to audio-guided sessions. Recorded workout videos are sent as backup." },
      { q: "Can I train online from outside India?", a: "Yes. FitVed has clients across USA, UK, Canada, Australia, and the Middle East. Trainers adjust session times to your timezone." },
    ]),
    "/female-personal-trainer/india": () => specialtyPage("female-personal-trainer/india", "Female Personal Trainer India", "Train with certified female personal trainers. Women-only fitness coaching for weight loss, prenatal, postnatal, PCOS, and general fitness.", "Many women prefer a female trainer for comfort, understanding, and relatability. FitVed has a growing team of certified female personal trainers and yoga instructors who specialise in women-specific health goals.", [
      { heading: "Why a Female Trainer", body: "Comfort discussing menstrual health, PCOS, pregnancy, and body image. Understanding of hormonal fluctuations affecting energy and performance. Relatability in setting realistic body composition goals. Comfortable environment for home training." },
      { heading: "Specialisations", body: "Weight loss and body toning. PCOS-friendly exercise programming. Prenatal and postnatal fitness. Diastasis recti recovery. Thyroid-supportive exercise. Strength training for women." },
    ], [
      { q: "Can I request a female trainer specifically?", a: "Yes. When booking your trial, select 'Female Trainer Preferred' and we'll assign from our female trainer team." },
      { q: "Do female trainers handle strength training?", a: "Absolutely. Our female trainers are certified in strength and conditioning, not just yoga or aerobics." },
    ]),
    "/pcos-fitness-coach/bengaluru": () => specialtyPage("pcos-fitness-coach/bengaluru", "PCOS Fitness Coach Bengaluru", "Specialised PCOS fitness coaching in Bengaluru. Exercise and nutrition programs designed to manage insulin resistance, hormonal balance, and weight.", "PCOS affects 1 in 5 Indian women and is fundamentally driven by insulin resistance in most cases. The right exercise program — combining resistance training, moderate cardio, and stress management — can improve insulin sensitivity by 25–40% and restore ovulatory cycles in many women.", [
      { heading: "How Exercise Helps PCOS", body: "Resistance training improves insulin sensitivity more than any other exercise type. It builds muscle mass which acts as a glucose sink, reducing circulating insulin. Moderate cardio (walking, cycling) improves cardiovascular health. Yoga and meditation reduce cortisol, which worsens PCOS when chronically elevated." },
      { heading: "Our PCOS Program", body: "3–4 strength sessions per week targeting large muscle groups. 2–3 moderate cardio sessions (walking, cycling — not excessive HIIT). Weekly yoga/meditation for stress management. Anti-inflammatory nutrition plan with protein-dominant meals. Monthly progress tracking including symptoms, weight, and measurements." },
    ], [
      { q: "Can exercise cure PCOS?", a: "Exercise doesn't cure PCOS but significantly manages it. Combined with nutrition changes, it can normalise periods, reduce androgen levels, improve fertility, and prevent progression to type 2 diabetes." },
      { q: "Should I avoid high-intensity exercise with PCOS?", a: "Excessive HIIT can raise cortisol, worsening PCOS. Moderate resistance training 3–4x/week with walking is the optimal approach for most PCOS patients." },
    ]),
    "/diabetes-fitness-coach/bengaluru": () => specialtyPage("diabetes-fitness-coach/bengaluru", "Diabetes Fitness Coach Bengaluru", "Exercise coaching for diabetes management in Bengaluru. Certified trainers who understand blood sugar, medication timing, and safe exercise protocols.", "Exercise is a first-line treatment for type 2 diabetes — a single session can lower blood glucose for 24–72 hours. But exercising with diabetes requires understanding of blood sugar patterns, medication timing, and hypoglycemia prevention. FitVed's diabetes-specialised coaches in Bengaluru design safe, effective programs.", [
      { heading: "Exercise and Blood Sugar", body: "Resistance training improves insulin sensitivity for 24–48 hours post-session. Walking after meals reduces post-prandial glucose spikes by 20–30%. The combination of strength training and walking is more effective than either alone." },
    ], [
      { q: "Is exercise safe with diabetes?", a: "Yes, and it's essential. Our coaches monitor blood sugar response and adjust programming. We coordinate with your endocrinologist when needed." },
    ]),
    "/thyroid-fitness-coach/bengaluru": () => specialtyPage("thyroid-fitness-coach/bengaluru", "Thyroid Fitness Coach Bengaluru", "Exercise coaching for thyroid conditions in Bengaluru. Programs designed for hypothyroid fatigue, metabolism support, and safe weight management.", "Hypothyroidism causes fatigue, weight gain, and muscle weakness — making exercise feel impossible. But the right exercise program, designed for thyroid patients, improves energy, supports metabolism, and helps manage weight.", [
      { heading: "Exercise for Thyroid Health", body: "Moderate strength training 3x/week boosts metabolism without overtaxing the adrenals. Low-impact cardio (walking, swimming) improves energy without exhaustion. Yoga supports stress management — chronic stress worsens thyroid function." },
    ], [
      { q: "Will exercise help my thyroid?", a: "Exercise doesn't directly treat thyroid hormone levels but significantly improves symptoms — energy, weight management, mood, and sleep quality." },
    ]),
    "/diabetes-reversal-coach/india": () => specialtyPage("diabetes-reversal-coach/india", "Diabetes Reversal Coach India", "Evidence-based diabetes reversal coaching combining exercise, nutrition, and lifestyle changes. Certified coaches experienced with Indian diabetic patients.", "Type 2 diabetes reversal — achieving normal blood sugar without medication — is possible for many early-stage patients through intensive lifestyle intervention. Studies show 40–60% of type 2 diabetics can achieve remission with sustained diet and exercise changes.", [
      { heading: "What Reversal Looks Like", body: "HbA1c below 6.5% without medication for 3+ months. Fasting glucose consistently below 126 mg/dL. Achieved through: calorie-controlled Indian diet, resistance training 3–4x/week, daily walking 8000+ steps, sleep optimisation, stress management." },
    ], [
      { q: "Can type 2 diabetes really be reversed?", a: "Yes, for many patients — especially those diagnosed within 6 years and with BMI above 25. It requires sustained lifestyle changes, not a short-term fix." },
    ]),
    "/diabetes-reversal-coach/bangalore": () => specialtyPage("diabetes-reversal-coach/bangalore", "Diabetes Reversal Coach Bangalore", "Diabetes reversal coaching in Bangalore. Exercise and nutrition programs for blood sugar normalisation.", "Bangalore's IT workforce has among the highest diabetes rates in India due to sedentary work, stress, and irregular eating. FitVed's diabetes reversal coaches combine structured exercise with practical Indian nutrition guidance.", [
      { heading: "Bangalore-Specific Approach", body: "Programs designed around 9-to-6 work schedules. Indian vegetarian and non-vegetarian meal plans. Home-based exercise — no gym dependency. Coordination with your endocrinologist." },
    ], [
      { q: "How long does reversal take?", a: "Most patients see significant HbA1c improvement in 3 months. Full remission (if achievable) typically takes 6–12 months of consistent effort." },
    ]),
    "/glp1-mounjaro-coach/india": () => specialtyPage("glp1-mounjaro-coach/india", "GLP-1 / Mounjaro Coach India", "Fitness and nutrition coaching for patients on GLP-1 medications (Mounjaro, Ozempic, Wegovy). Preserve muscle while losing fat.", "GLP-1 receptor agonists like tirzepatide (Mounjaro) and semaglutide (Ozempic/Wegovy) produce dramatic weight loss — but up to 40% of weight lost can be muscle mass without proper exercise and nutrition. A specialised coach ensures you lose fat, not muscle.", [
      { heading: "Why You Need a Coach on GLP-1s", body: "GLP-1 medications reduce appetite significantly, making it easy to under-eat protein. Muscle loss from rapid weight loss reduces metabolic rate, setting up weight regain. Resistance training 3–4x/week plus protein at 1.6–2.0 g/kg preserves lean mass during medication-assisted weight loss." },
    ], [
      { q: "Will I lose muscle on Mounjaro?", a: "Without exercise and adequate protein, yes — studies show 25–40% of weight lost on GLP-1s is lean mass. Our program minimises this with structured strength training and protein-focused nutrition." },
    ]),
    "/postpartum-weight-loss/india": () => specialtyPage("postpartum-weight-loss/india", "Postpartum Weight Loss India", "Safe postpartum weight loss coaching. Certified trainers experienced in diastasis recti, pelvic floor recovery, and breastfeeding-compatible nutrition.", "Postpartum weight loss requires patience, safety awareness, and programming that accounts for diastasis recti, weakened pelvic floor, hormonal changes, and breastfeeding energy demands. FitVed's postnatal specialists guide new mothers through evidence-based recovery.", [
      { heading: "Safe Timeline", body: "Normal delivery: gentle walking from week 1, structured exercise from 6 weeks postpartum. C-section: walking from week 2, structured exercise from 8–12 weeks (doctor clearance required). First 3 months focus on core and pelvic floor recovery, not weight loss." },
    ], [
      { q: "When can I start exercising after delivery?", a: "Gentle walking can begin within days. Structured exercise: 6 weeks post-vaginal delivery, 8–12 weeks post-C-section, with doctor clearance." },
    ]),
    "/diastasis-recti-recovery/india": () => specialtyPage("diastasis-recti-recovery/india", "Diastasis Recti Recovery India", "Specialised exercise coaching for diastasis recti recovery. Close the gap safely with evidence-based core rehabilitation.", "Diastasis recti — separation of the rectus abdominis muscles — affects 60% of women postpartum and many men with abdominal obesity. Traditional crunches worsen the condition. FitVed's specialists use evidence-based core rehabilitation protocols.", [
      { heading: "What Works", body: "Diaphragmatic breathing and transverse abdominis activation. Progressive core loading from inner to outer muscles. Avoiding exercises that increase intra-abdominal pressure (crunches, sit-ups, planks initially). Gradual return to full core training over 3–6 months." },
    ], [
      { q: "Can diastasis recti be fixed without surgery?", a: "Most cases (gap under 3 finger-widths) respond well to targeted exercise. Gaps larger than 3 widths that don't improve in 6 months may need surgical consultation." },
    ]),
    "/post-pregnancy-weight-loss-coach/india": () => specialtyPage("post-pregnancy-weight-loss-coach/india", "Post Pregnancy Weight Loss Coach India", "Expert postnatal fitness coaching for safe, sustainable weight loss after pregnancy. Breastfeeding-safe nutrition and progressive exercise.", "Losing pregnancy weight safely requires a different approach than standard weight loss. You need adequate calories for recovery and breastfeeding, core and pelvic floor rehabilitation before intense exercise, and patience — it took 9 months to gain, allow 9–12 months to lose.", [
      { heading: "Our Approach", body: "Phase 1 (0–3 months): Recovery — breathing, gentle walking, pelvic floor. Phase 2 (3–6 months): Foundation — bodyweight strength, moderate cardio, core rebuilding. Phase 3 (6–12 months): Progressive weight loss — structured training, calorie management (breastfeeding-safe)." },
    ], [
      { q: "Can I diet while breastfeeding?", a: "Aggressive calorie restriction can affect milk supply. We recommend a moderate deficit (300–500 calories) with adequate protein and hydration. Most mothers can safely lose 0.5 kg/week while breastfeeding." },
    ]),
    "/lactation-safe-weight-loss/india": () => specialtyPage("lactation-safe-weight-loss/india", "Lactation Safe Weight Loss India", "Lose weight safely while breastfeeding. Nutrition and exercise programs that protect milk supply.", "Many new mothers are told they cannot lose weight while breastfeeding — this is a myth. With a moderate caloric deficit, adequate hydration, and proper nutrition, safe weight loss during lactation is absolutely possible.", [
      { heading: "Key Principles", body: "Minimum 1800 calories daily to maintain milk supply. Protein at 1.4–1.6 g/kg to preserve muscle and support lactation. Adequate calcium (1000 mg/day), iron, and omega-3. Gradual weight loss target: 0.5 kg/week maximum." },
    ], [
      { q: "Will exercise affect my milk supply?", a: "Moderate exercise does not affect milk supply or milk quality. Extreme exercise with severe calorie restriction might — which is why we use moderate, sustainable approaches." },
    ]),
    "/online-yoga/india": () => { const base = yogaCity("india", "India"); return { ...base, title: "Online Yoga Classes India", h1: "Online Yoga Classes Across India", metaTitle: "Online Yoga Classes India — Live 1-on-1 | FitVed" }; },
    "/online-yoga/hatha": () => { const base = yogaCity("india", "India"); return { ...base, title: "Online Hatha Yoga India", h1: "Online Hatha Yoga Classes", metaTitle: "Online Hatha Yoga Classes India | FitVed", metaDescription: "Learn authentic Hatha yoga online with certified instructors. Foundational postures, breathwork, and meditation. 1-on-1 live sessions." }; },
    "/online-yoga/vinyasa": () => { const base = yogaCity("india", "India"); return { ...base, title: "Online Vinyasa Yoga India", h1: "Online Vinyasa Flow Yoga", metaTitle: "Online Vinyasa Yoga Classes India | FitVed", metaDescription: "Dynamic Vinyasa flow yoga online. Breath-linked movement sequences for flexibility, strength, and cardiovascular fitness." }; },
    "/prenatal-yoga/india": () => { const base = yogaCity("india", "India"); return { ...base, title: "Prenatal Yoga Online India", h1: "Prenatal Yoga Classes Online", metaTitle: "Prenatal Yoga Online India — Safe Pregnancy Yoga | FitVed", metaDescription: "Safe prenatal yoga classes online with certified instructors. Modified postures for each trimester. Breathwork for labour preparation." }; },
    "/prenatal-yoga/mumbai": () => { const base = yogaCity("mumbai", "Mumbai"); return { ...base, title: "Prenatal Yoga Mumbai", h1: "Prenatal Yoga Classes in Mumbai", metaTitle: "Prenatal Yoga Mumbai — Online & Home | FitVed" }; },
    "/prenatal-yoga/kolkata": () => { const base = yogaCity("kolkata", "Kolkata"); return { ...base, title: "Prenatal Yoga Kolkata", h1: "Prenatal Yoga Classes in Kolkata", metaTitle: "Prenatal Yoga Kolkata — Online & Home | FitVed" }; },
    "/prenatal-yoga/usa-nri": () => { const base = yogaCity("usa-nri", "USA (NRI)"); return { ...base, title: "Prenatal Yoga Online USA NRI", h1: "Prenatal Yoga for NRIs in USA", metaTitle: "Prenatal Yoga Online USA NRI | FitVed" }; },
    "/yoga-trainer/bangalore": () => { const base = yogaCity("bangalore", "Bangalore"); return { ...base, title: "Yoga Trainer in Bangalore", h1: "Find a Yoga Trainer in Bangalore" }; },
    "/pilates-trainer/bangalore": () => specialtyPage("pilates-trainer/bangalore", "Pilates Trainer in Bangalore", "Certified Pilates instructors in Bangalore. Mat and reformer Pilates for core strength, flexibility, and rehabilitation.", "Pilates focuses on core stability, controlled movement, and body awareness. FitVed's certified Pilates instructors in Bangalore offer mat-based sessions at your home — ideal for rehabilitation, posture correction, and functional strength.", [
      { heading: "What Pilates Offers", body: "Core strength without impact stress on joints. Improved posture and spinal alignment. Rehabilitation from back injuries and surgeries. Enhanced flexibility and body control. Complement to strength training and yoga." },
    ], [
      { q: "Do I need a reformer for Pilates?", a: "No. Mat Pilates is effective and requires no equipment. Our instructors bring small props (balls, bands, rings) for variety." },
    ]),
    "/weight-loss-coach/bangalore": () => specialtyPage("weight-loss-coach/bangalore", "Weight Loss Coach Bangalore", "Certified weight loss coaches in Bangalore. Personalised diet and exercise programs for sustainable fat loss.", "Weight loss in Bangalore's tech-driven lifestyle requires a practical approach — meal plans that work with office schedules, exercise that fits into 45-minute windows, and accountability from someone who checks in regularly.", [
      { heading: "Our Weight Loss Approach", body: "Caloric deficit calculated from your TDEE. Indian diet plans — no elimination diets. Resistance training to preserve muscle. Daily step targets for NEAT (non-exercise activity thermogenesis). Weekly check-ins with body measurements." },
    ], [
      { q: "How much weight can I lose per month?", a: "Sustainable fat loss: 2–4 kg per month. Faster rates risk muscle loss and metabolic adaptation." },
    ]),
    "/fat-loss-trainer/bengaluru": () => specialtyPage("fat-loss-trainer/bengaluru", "Fat Loss Trainer Bengaluru", "Certified fat loss specialists in Bengaluru. Body recomposition through strength training, cardio, and nutrition coaching.", "Fat loss is different from weight loss — the goal is to lose fat while preserving muscle. This requires strength training, adequate protein, moderate calorie deficit, and patience.", [
      { heading: "Fat Loss vs Weight Loss", body: "Weight loss = losing anything (fat, muscle, water). Fat loss = specifically losing adipose tissue while maintaining lean mass. Body recomposition — losing fat and building muscle simultaneously — is possible for beginners and those returning to training." },
    ], [
      { q: "Can I lose fat and gain muscle at the same time?", a: "Yes, especially if you're a beginner or returning to training. It requires adequate protein (2.0 g/kg), moderate deficit (300–500 cal), and resistance training 3–4x/week." },
    ]),
    "/powerlifting-coach/bangalore": () => specialtyPage("powerlifting-coach/bangalore", "Powerlifting Coach Bangalore", "Competitive and recreational powerlifting coaching in Bangalore. Squat, bench, deadlift programming with certified coaches.", "Powerlifting develops maximal strength through three lifts: squat, bench press, and deadlift. Whether you want to compete or simply get strong, a qualified coach ensures safe progression, proper technique, and periodised programming.", [
      { heading: "What We Offer", body: "Technique coaching for squat, bench press, and deadlift. Periodised programming (linear, block, undulating). Competition preparation if desired. Accessory work for weak points. Nutrition for strength sports." },
    ], [
      { q: "Do I need to compete?", a: "No. Many people train the powerlifts for general strength without competing. The lifts are the most efficient way to build whole-body strength." },
    ]),
    "/indian-fat-loss-guide": () => specialtyPage("indian-fat-loss-guide", "Indian Fat Loss Guide", "Complete evidence-based guide to fat loss using Indian foods and exercise. Practical meal plans, workout routines, and lifestyle changes.", "Fat loss for Indians requires strategies built around Indian food culture — dal-rice, rotis, curries, chai. This guide provides a practical, science-based framework using everyday Indian foods and accessible exercise.", [
      { heading: "The Indian Fat Loss Framework", body: "1. Calculate your TDEE and create a 400–500 calorie deficit. 2. Protein-first approach: 1.6–2.0 g/kg from paneer, soya, dal, eggs, chicken. 3. Resistance training 3–4x/week. 4. Walking 8000+ steps daily. 5. Sleep 7–8 hours. This framework works for every Indian body type and food preference." },
    ], [
      { q: "Can I lose fat eating Indian food?", a: "Absolutely. Indian food is not inherently fattening — portions and cooking methods matter. A well-designed Indian diet with adequate protein easily supports fat loss." },
    ]),
  };

  if (specialtyMap[p]) return specialtyMap[p]();

  // ── Bangalore special pages ─────────────────────────────────────────────────
  if (p === "/personal-trainer/bangalore/home-training") {
    const base = personalTrainerCity("bangalore", "Bangalore");
    return { ...base, title: "Personal Trainer at Home Bangalore", h1: "At-Home Personal Training in Bangalore", metaTitle: "Personal Trainer at Home Bangalore | FitVed" };
  }
  if (p === "/personal-trainer/bangalore/cost") {
    const base = personalTrainerCity("bangalore", "Bangalore");
    return { ...base, title: "Personal Trainer Cost Bangalore", h1: "How Much Does a Personal Trainer Cost in Bangalore?", metaTitle: "Personal Trainer Cost Bangalore — Pricing Guide | FitVed", metaDescription: "Personal trainer costs in Bangalore: Rs 2,500–6,000/month. Complete pricing guide with factors, comparisons, and value analysis." };
  }

  return null;
}

export function getAllGeoPagePaths(): string[] {
  const paths: string[] = [];
  const ptCities = [
    "bangalore", "mumbai", "delhi-ncr", "pune", "hyderabad", "chennai",
    "kolkata", "ahmedabad", "gurgaon", "noida", "greater-noida", "faridabad",
    "jaipur", "lucknow", "chandigarh", "indore", "coimbatore", "kochi",
    "thiruvananthapuram", "bhubaneswar", "guwahati", "nagpur", "visakhapatnam",
    "mysore", "mangalore", "surat", "vadodara", "usa-nri",
    "usa/indian-americans", "usa/texas", "usa/new-jersey", "usa/bay-area",
    "uk", "canada", "australia", "dubai", "abu-dhabi", "singapore", "germany",
  ];
  ptCities.forEach((c) => paths.push(`/personal-trainer/${c}`));
  paths.push("/personal-trainer/bangalore/home-training", "/personal-trainer/bangalore/cost");

  const yogaCities = ["mumbai", "delhi-ncr", "pune", "kolkata", "gurgaon", "noida", "usa-nri", "nri"];
  yogaCities.forEach((c) => paths.push(`/yoga/${c}`));

  const strengthCities = ["bangalore", "mumbai", "delhi-ncr", "pune", "kolkata", "usa-nri", "noida"];
  strengthCities.forEach((c) => paths.push(`/strength-training/${c}`));

  const vegCities = ["bangalore", "mumbai", "delhi-ncr", "pune", "usa"];
  vegCities.forEach((c) => paths.push(`/vegetarian-muscle-building/${c}`));

  const cwPages = [
    "india", "bangalore", "mumbai", "delhi-ncr", "pune", "hyderabad", "chennai", "yoga", "employee-fitness",
  ];
  cwPages.forEach((c) => paths.push(`/corporate-wellness/${c}`));

  const comparisons = [
    "personal-trainer-vs-cultfit", "personal-trainer-vs-curefit", "personal-trainer-vs-cult-pass-live",
    "personal-trainer-vs-healthifyme", "personal-trainer-vs-fittr", "personal-trainer-vs-anytime-fitness",
    "personal-trainer-vs-gym-membership",
  ];
  comparisons.forEach((c) => paths.push(`/compare/${c}`));

  const calculators = [
    "bmi-calculator", "calorie-calculator", "macro-calculator",
    "ideal-weight-calculator", "tdee-calculator", "daily-calorie-burn-calculator",
  ];
  calculators.forEach((c) => paths.push(`/${c}`));

  const specialties = [
    "/online-personal-trainer/india", "/female-personal-trainer/india",
    "/pcos-fitness-coach/bengaluru", "/diabetes-fitness-coach/bengaluru",
    "/thyroid-fitness-coach/bengaluru", "/diabetes-reversal-coach/india",
    "/diabetes-reversal-coach/bangalore", "/glp1-mounjaro-coach/india",
    "/postpartum-weight-loss/india", "/diastasis-recti-recovery/india",
    "/post-pregnancy-weight-loss-coach/india", "/lactation-safe-weight-loss/india",
    "/online-yoga/india", "/online-yoga/hatha", "/online-yoga/vinyasa",
    "/prenatal-yoga/india", "/prenatal-yoga/mumbai", "/prenatal-yoga/kolkata",
    "/prenatal-yoga/usa-nri", "/yoga-trainer/bangalore",
    "/pilates-trainer/bangalore", "/weight-loss-coach/bangalore",
    "/fat-loss-trainer/bengaluru", "/powerlifting-coach/bangalore",
    "/indian-fat-loss-guide",
  ];
  specialties.forEach((s) => paths.push(s));

  return paths;
}
