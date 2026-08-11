import { BlogArticle } from "@/lib/blog/types";
import { getEditorialDisplayTitle } from "@/lib/blog/editorialTitles";
import { CATEGORIES_DATA } from "./categories";
import researchedRaw from "./researchedArticles.json";
import seoSlugMapRaw from "./seoSlugs.json";

// Real, hand-researched articles are the primary blog content. Stored as JSON
// so the sitemap generator (scripts/generate-sitemap.cjs) can read the exact
// same source without a TS toolchain — one source of truth for slugs.
const RESEARCHED_ARTICLES = researchedRaw as unknown as BlogArticle[];
import { resolveFeaturedImage } from "@/lib/blog/featuredImageMap";

const SEO_SLUG_MAP: Record<string, Record<string, string>> = seoSlugMapRaw;

// Expanded content upgrades thin programmatic articles to premium guides.
// Each JSON maps slug → { summary, reading_time, seo_title, seo_description, keywords, image_alt, content, faq_schema }
import nutritionExpanded from "./expanded/nutrition.json";
import weightLossExpanded from "./expanded/weight-loss.json";
import muscleGainExpanded from "./expanded/muscle-gain.json";
import proteinExpanded from "./expanded/protein.json";
import recipesExpanded from "./expanded/recipes.json";
import supplementsExpanded from "./expanded/supplements.json";
import womensHealthExpanded from "./expanded/womens-health.json";
import beginnerGuidesExpanded from "./expanded/beginner-guides.json";
import fatLossExpanded from "./expanded/fat-loss.json";
import pcosExpanded from "./expanded/pcos.json";
import seniorFitnessExpanded from "./expanded/senior-fitness.json";
import vitaminsExpanded from "./expanded/vitamins.json";
import wheyProteinExpanded from "./expanded/whey-protein.json";
// Phase 2: 29 newly generated topic files
import diabetesExpanded from "./expanded/diabetes.json";
import heartHealthExpanded from "./expanded/heart-health.json";
import longevityExpanded from "./expanded/longevity.json";
import sleepExpanded from "./expanded/sleep.json";
import stressExpanded from "./expanded/stress.json";
import workplaceFitnessExpanded from "./expanded/workplace-fitness.json";
import homeWorkoutsExpanded from "./expanded/home-workouts.json";
import gymExpanded from "./expanded/gym.json";
import yogaExpanded from "./expanded/yoga.json";
import runningExpanded from "./expanded/running.json";
import mobilityExpanded from "./expanded/mobility.json";
import recoveryExpanded from "./expanded/recovery.json";
import injuriesExpanded from "./expanded/injuries.json";
import creatineExpanded from "./expanded/creatine.json";
import corporateWellnessExpanded from "./expanded/corporate-wellness.json";
import pregnancyExpanded from "./expanded/pregnancy.json";
import postpartumExpanded from "./expanded/postpartum.json";
import mensHealthExpanded from "./expanded/mens-health.json";
import gutHealthExpanded from "./expanded/gut-health.json";
import indianDietsExpanded from "./expanded/indian-diets.json";
import regionalIndianFoodsExpanded from "./expanded/regional-indian-foods.json";
import mealPlansExpanded from "./expanded/meal-plans.json";
import comparisonsExpanded from "./expanded/comparisons.json";
import calculatorsExpanded from "./expanded/calculators.json";
import bangaloreLocalGuidesExpanded from "./expanded/bangalore-local-guides.json";
import nriFitnessExpanded from "./expanded/nri-fitness.json";
import healthyHabitsExpanded from "./expanded/healthy-habits.json";
import fitnessScienceExpanded from "./expanded/fitness-science.json";
import kidsNutritionExpanded from "./expanded/kids-nutrition.json";

const EXPANDED_CONTENT: Record<string, any> = {
  // Original 13 topics
  ...nutritionExpanded,
  ...weightLossExpanded,
  ...muscleGainExpanded,
  ...proteinExpanded,
  ...recipesExpanded,
  ...supplementsExpanded,
  ...womensHealthExpanded,
  ...beginnerGuidesExpanded,
  ...fatLossExpanded,
  ...pcosExpanded,
  ...seniorFitnessExpanded,
  ...vitaminsExpanded,
  ...wheyProteinExpanded,
  // 29 newly generated topics
  ...diabetesExpanded,
  ...heartHealthExpanded,
  ...longevityExpanded,
  ...sleepExpanded,
  ...stressExpanded,
  ...workplaceFitnessExpanded,
  ...homeWorkoutsExpanded,
  ...gymExpanded,
  ...yogaExpanded,
  ...runningExpanded,
  ...mobilityExpanded,
  ...recoveryExpanded,
  ...injuriesExpanded,
  ...creatineExpanded,
  ...corporateWellnessExpanded,
  ...pregnancyExpanded,
  ...postpartumExpanded,
  ...mensHealthExpanded,
  ...gutHealthExpanded,
  ...indianDietsExpanded,
  ...regionalIndianFoodsExpanded,
  ...mealPlansExpanded,
  ...comparisonsExpanded,
  ...calculatorsExpanded,
  ...bangaloreLocalGuidesExpanded,
  ...nriFitnessExpanded,
  ...healthyHabitsExpanded,
  ...fitnessScienceExpanded,
  ...kidsNutritionExpanded,
};

// Seed / Initial Curated Core Articles (High-Detail Articles)
const CURATED_ARTICLES: BlogArticle[] = [
  {
    id: "art-1",
    title: "How to Get 100g Protein Daily on a Pure Vegetarian Indian Diet",
    display_title: "How to Get 100g Protein on a Vegetarian Diet",
    slug: "100g-protein-vegetarian-diet",
    summary: "Discover exact meal charts, protein density tables, and daily meal plans using paneer, soya, sattu, lentils, and dairy.",
    featured_image: resolveFeaturedImage({ title: "How to Get 100g Protein Daily on a Pure Vegetarian Indian Diet", slug: "100g-protein-vegetarian-diet" }),
    published_at: "2026-07-25T10:00:00Z",
    updated_at: "2026-08-01T12:00:00Z",
    reading_time: 7,
    tags: ["Protein", "Vegetarian", "Indian Diet", "Meal Prep", "Weight Loss"],
    category_id: "cat-4", // Protein
    author_id: "author-1",
    is_featured: true,
    is_editor_pick: true,
    is_popular: true,
    published: true,
    seo_title: "100g Protein Vegetarian Indian Diet Chart & Meal Plan | FitVed",
    seo_description: "Learn how to get 100 grams of high-quality protein on an Indian vegetarian diet using paneer, soya, dahi, and sattu with exact macro tables.",
    canonical_url: "https://www.getfitved.com/blog/article/100g-protein-vegetarian-diet",
    topic_hub_slug: "high-protein-indian-diet",
    content: {
      keyTakeaways: [
        "Combining grain + pulse sources (e.g. Rice + Dal) completes the essential amino acid profile.",
        "Soya chunks offer 52g protein per 100g dry weight, making them the most cost-effective protein source in India.",
        "Paneer is high in protein but calorie-dense; opt for low-fat paneer or balance fat intake throughout the day.",
        "Hung curd (Greek style) delivers double the protein of regular homemade curd.",
      ],
      medicalDisclaimer: true,
      coachReviewBadge: "Reviewed by Dr. Ananya Sharma, Ph.D. (Clinical Dietitian)",
      blocks: [
        {
          type: "paragraph",
          content: "Hitting 100 grams of protein daily on a traditional Indian vegetarian diet is often considered difficult due to the carb-heavy nature of typical thalis. However, by strategically choosing high-protein Indian ingredients, you can easily hit your macro targets without relying solely on imported protein powders.",
        },
        {
          type: "heading",
          level: 2,
          title: "Top High Protein Vegetarian Foods in India",
        },
        {
          type: "nutrition_table",
          title: "Protein Content of Indian Staples (per 100g)",
          tableData: [
            { Food: "Soya Chunks (Dry)", Protein: "52g", Calories: "345 kcal", Carbs: "33g" },
            { Food: "Low Fat Paneer", Protein: "22g", Calories: "160 kcal", Carbs: "4g" },
            { Food: "Sattu (Roasted Gram Flour)", Protein: "20g", Calories: "380 kcal", Carbs: "60g" },
            { Food: "Hung Curd / Greek Yogurt", Protein: "10g", Calories: "90 kcal", Carbs: "4g" },
            { Food: "Boiled Chickpeas (Kala Chana)", Protein: "9g", Calories: "164 kcal", Carbs: "27g" },
          ],
        },
        {
          type: "callout",
          title: "Pro Tip for Digestion",
          content: "If you experience bloating from soya chunks or legumes, soak them in warm water with a pinch of hing (asafoetida) for 30 minutes before cooking.",
        },
        {
          type: "heading",
          level: 2,
          title: "Sample 100g Protein Indian Vegetarian Meal Plan",
        },
        {
          type: "paragraph",
          content: "Breakfast: 2 Besan-Sattu Chillas + 100g Hung Curd (24g Protein)\nLunch: 50g Soya Chunks curry + 1 Katori Dal + 2 Multigrain Rotis (38g Protein)\nEvening Snack: Roasted Chana + Whey/Sattu Shake (20g Protein)\nDinner: 150g Paneer Bhurji + Green Salad (25g Protein)",
        },
      ],
    },
    faq_schema: [
      {
        question: "Can soya chunks cause hormonal imbalance in men?",
        answer: "No. Scientific studies show that moderate consumption of soya (up to 50g daily) does not adversely affect testosterone or estrogen levels in men.",
      },
      {
        question: "Is Dal alone a complete protein source?",
        answer: "No. Dal is low in methionine. However, when eaten with rice or roti (which contain methionine), it forms a complete protein.",
      },
    ],
  },
  {
    id: "art-2",
    title: "High Protein Paneer Bhurji Recipe (32g Protein in 15 Mins)",
    display_title: "Protein Paneer Bhurji in 15 Minutes",
    slug: "protein-paneer-bhurji",
    summary: "Quick, delicious, and low-carb Indian paneer bhurji prepared with minimum oil, packed with 32g protein.",
    featured_image: resolveFeaturedImage({ title: "High Protein Paneer Bhurji Recipe (32g Protein in 15 Mins)", slug: "protein-paneer-bhurji" }),
    published_at: "2026-07-28T09:00:00Z",
    updated_at: "2026-08-02T10:00:00Z",
    reading_time: 5,
    tags: ["Recipes", "High Protein", "Paneer", "Vegetarian", "Quick Meal"],
    category_id: "cat-5", // Recipes
    author_id: "author-1",
    is_featured: false,
    is_editor_pick: true,
    is_popular: true,
    published: true,
    seo_title: "High Protein Paneer Bhurji Recipe (32g Protein) | FitVed",
    seo_description: "Learn how to make low-fat High Protein Paneer Bhurji in 15 minutes with exact calorie and macro nutrition breakdown.",
    canonical_url: "https://www.getfitved.com/blog/recipe/protein-paneer-bhurji",
    recipe_details: {
      prep_time_mins: 5,
      cook_time_mins: 10,
      servings: 1,
      difficulty: "Easy",
      calories: 320,
      protein_g: 32,
      carbs_g: 8,
      fat_g: 16,
      diet_type: "Vegetarian",
      ingredients: [
        "150g Low Fat Paneer (Crumbling)",
        "1 tsp Mustard Oil / Ghee",
        "1 Medium Onion (Finely Chopped)",
        "1 Medium Tomato (Chopped)",
        "1 Green Chili & 1 tsp Ginger-Garlic paste",
        "Spices: Turmeric, Red Chili powder, Garam Masala, Salt",
        "Fresh Coriander for Garnish",
      ],
      instructions: [
        "Heat 1 tsp oil in a non-stick pan and add cumin seeds, green chili, and ginger-garlic paste.",
        "Saute chopped onions until golden brown, then add tomatoes and cook until soft.",
        "Add turmeric, red chili powder, and salt. Stir well for 1 minute.",
        "Crumble 150g low-fat paneer directly into the pan and mix thoroughly for 2-3 minutes.",
        "Garnish with fresh coriander and serve hot with multi-grain roti or toasted sourdough.",
      ],
      tips: ["Do not overcook paneer as it becomes chewy. 3 minutes on medium heat is ideal."],
    },
    content: {
      keyTakeaways: [
        "Uses low-fat paneer to keep calories controlled while maintaining 32g protein.",
        "Takes under 15 minutes to cook, making it ideal for busy workdays.",
      ],
      blocks: [
        {
          type: "paragraph",
          content: "Paneer Bhurji is one of India's favorite comfort foods. By tweaking cooking oils and using low-fat cottage cheese, this recipe turns into a high-protein bodybuilding powerhouse meal.",
        },
      ],
    },
  },
  {
    id: "art-3",
    title: "Gym vs Home Workouts: Which is Better for Indian Working Professionals?",
    display_title: "Gym vs Home Workouts for Working Professionals",
    slug: "gym-vs-home-workouts",
    summary: "Detailed comparison evaluating cost, time savings, equipment, privacy, and long-term consistency for home vs gym training.",
    featured_image: resolveFeaturedImage({ title: "Gym vs Home Workouts: Which is Better for Indian Working Professionals?", slug: "gym-vs-home-workouts" }),
    published_at: "2026-07-29T11:00:00Z",
    updated_at: "2026-08-03T14:00:00Z",
    reading_time: 6,
    tags: ["Comparison", "Home Workout", "Gym", "Personal Training", "Lifestyle"],
    category_id: "cat-37", // Comparisons
    author_id: "author-2",
    is_featured: false,
    is_editor_pick: true,
    is_popular: true,
    published: true,
    seo_title: "Gym vs Home Workouts Comparison for Working Professionals | FitVed",
    seo_description: "Compare Gym vs Home Personal Training on cost, commute time, consistency, and privacy for Indian professionals.",
    canonical_url: "https://www.getfitved.com/blog/compare/gym-vs-home-workouts",
    comparison_details: {
      optionA: {
        name: "At-Home Personal Training",
        subtitle: "Guided 1-on-1 workouts in your apartment/society",
        pros: [
          "Zero travel time & zero traffic stress",
          "100% personalized 1-on-1 attention",
          "High consistency rate (92% completion)",
          "Private & comfortable environment",
        ],
        cons: [
          "Requires initial space in home or society gym",
        ],
        rating: 4.9,
      },
      optionB: {
        name: "Commercial Gym Membership",
        subtitle: "Access to large gym facilities and heavy weights",
        pros: [
          "Access to heavy machines and barbells",
          "Social gym atmosphere",
        ],
        cons: [
          "Average 45 mins wasted in daily traffic commute",
          "Crowded peak hours (6 AM & 7 PM)",
          "Low attendance retention (less than 30% after 3 months)",
        ],
        rating: 4.1,
      },
      winner: "optionA",
      verdict: "At-home personal training wins for busy working professionals who struggle with consistency, daily traffic commute, and peak gym crowds.",
      featureMatrix: [
        { feature: "Time Requirement", optionAVal: "45 mins total", optionBVal: "1.5 to 2 hours with commute" },
        { feature: "Personal Guidance", optionAVal: "Dedicated 1-on-1 Coach", optionBVal: "General trainer shared with 20+ people" },
        { feature: "Consistency Rate", optionAVal: "92% Retention", optionBVal: "28% Retention" },
        { feature: "Hygiene & Comfort", optionAVal: "100% Private", optionBVal: "Shared equipment" },
      ],
    },
    content: {
      blocks: [
        {
          type: "paragraph",
          content: "Choosing between a gym membership and home workouts depends heavily on your daily schedule, traffic conditions in cities like Bangalore or Mumbai, and personal motivation.",
        },
      ],
    },
  },
  {
    id: "art-4",
    title: "PCOS Weight Loss Guide: How to Reverse Insulin Resistance Naturally",
    display_title: "PCOS & Weight Loss: What Actually Helps",
    slug: "pcos-weight-loss",
    summary: "Comprehensive evidence-based strategy for women managing PCOS, hormonal acne, weight gain, and irregular cycles through targeted diet & exercise.",
    featured_image: resolveFeaturedImage({ title: "PCOS Weight Loss Guide: How to Reverse Insulin Resistance Naturally", slug: "pcos-weight-loss" }),
    published_at: "2026-07-30T08:00:00Z",
    updated_at: "2026-08-04T09:00:00Z",
    reading_time: 8,
    tags: ["Women's Health", "PCOS", "Weight Loss", "Hormones", "Nutrition"],
    category_id: "cat-8", // PCOS
    author_id: "author-1",
    is_featured: false,
    is_editor_pick: true,
    is_popular: true,
    published: true,
    seo_title: "PCOS Weight Loss & Insulin Resistance Guide | FitVed",
    seo_description: "Learn how to manage PCOS weight gain, reduce insulin resistance with low-GI Indian foods and resistance training.",
    canonical_url: "https://www.getfitved.com/blog/article/pcos-weight-loss",
    topic_hub_slug: "pcos-hormone-health",
    content: {
      keyTakeaways: [
        "Insulin resistance affects nearly 70% of women with PCOS.",
        "Strength training improves insulin sensitivity better than chronic cardio.",
        "Avoid strict zero-carb diets; prioritize complex carbs like ragi, jowar, and oats.",
      ],
      medicalDisclaimer: true,
      coachReviewBadge: "Reviewed by Dr. Ananya Sharma, Ph.D.",
      blocks: [
        {
          type: "paragraph",
          content: "PCOS (Polycystic Ovary Syndrome) is one of the most common endocrine disorders affecting Indian women. Losing weight with PCOS can feel uphill because elevated insulin levels signal the body to store fat instead of burning it.",
        },
        {
          type: "heading",
          level: 2,
          title: "Best Indian Foods for PCOS Management",
        },
        {
          type: "paragraph",
          content: "Incorporate low-glycemic foods such as sprouts, roasted chana, spinach, chia seeds, and cinnamon tea while minimizing refined maida and sugary beverages.",
        },
      ],
    },
  },
];

// Helper to programmatically generate 500+ structured articles spanning all 42 categories
function generateProgrammaticArticles(): BlogArticle[] {
  const generated: BlogArticle[] = [];
  const authors = ["author-1", "author-2", "author-3"];

  // Topics and titles seed templates per category
  const topicTemplates = [
    { catSlug: "nutrition", title: "Complete Indian Diet Guide for {topic}", tag: "Nutrition" },
    { catSlug: "weight-loss", title: "How to Lose Belly Fat with Indian Home Food: {topic}", tag: "Weight Loss" },
    { catSlug: "muscle-gain", title: "Hypertrophy & Muscle Building Protocol for {topic}", tag: "Muscle Gain" },
    { catSlug: "protein", title: "Top High Protein Foods for {topic} in India", tag: "Protein" },
    { catSlug: "recipes", title: "High Protein Quick Recipe for {topic}", tag: "Recipes" },
    { catSlug: "supplements", title: "Scientific Supplement Guide for {topic}", tag: "Supplements" },
    { catSlug: "womens-health", title: "Essential Women's Health Strategy for {topic}", tag: "Women's Health" },
    { catSlug: "pcos", title: "PCOS Reversal & Diet Protocols for {topic}", tag: "PCOS" },
    { catSlug: "diabetes", title: "Managing Blood Sugar & HbA1c with {topic}", tag: "Diabetes" },
    { catSlug: "heart-health", title: "Cardiovascular Health & Lipid Profile Guide: {topic}", tag: "Heart Health" },
    { catSlug: "longevity", title: "Anti-Aging & Cellular Vitality via {topic}", tag: "Longevity" },
    { catSlug: "sleep", title: "Sleep Optimization & Circadian Recovery for {topic}", tag: "Sleep" },
    { catSlug: "stress", title: "Cortisol Reduction & Mindfulness Guide for {topic}", tag: "Stress" },
    { catSlug: "workplace-fitness", title: "Office Ergonomics & Desk Fitness for {topic}", tag: "Workplace Fitness" },
    { catSlug: "home-workouts", title: "No-Equipment Home Workout Protocol for {topic}", tag: "Home Workouts" },
    { catSlug: "gym", title: "Barbell & Machine Setup Guide for {topic}", tag: "Gym" },
    { catSlug: "yoga", title: "Pranayama & Asana Flow for {topic}", tag: "Yoga" },
    { catSlug: "running", title: "5k & 10k Endurance Running Strategy for {topic}", tag: "Running" },
    { catSlug: "mobility", title: "Hip & Shoulder Mobility Drills for {topic}", tag: "Mobility" },
    { catSlug: "recovery", title: "DOMS Relief & Muscle Recovery Protocols for {topic}", tag: "Recovery" },
    { catSlug: "injuries", title: "Lower Back & Knee Rehab Exercises for {topic}", tag: "Injuries" },
    { catSlug: "creatine", title: "Creatine Monohydrate Loading & Dosage Guide for {topic}", tag: "Creatine" },
    { catSlug: "whey-protein", title: "Whey Concentrate vs Isolate Comparison for {topic}", tag: "Whey Protein" },
    { catSlug: "vitamins", title: "Vitamin D3 & B12 Deficiency Guide for {topic}", tag: "Vitamins" },
    { catSlug: "fat-loss", title: "Caloric Deficit & Metabolism Boost for {topic}", tag: "Fat Loss" },
    { catSlug: "beginner-guides", title: "Step-by-Step Beginner Fitness Blueprint for {topic}", tag: "Beginner Guides" },
    { catSlug: "senior-fitness", title: "Active Aging & Bone Density Workout for {topic}", tag: "Senior Fitness" },
    { catSlug: "kids-nutrition", title: "Childhood Growth & Healthy Tiffin Hacks for {topic}", tag: "Kids Nutrition" },
    { catSlug: "corporate-wellness", title: "Executive Health & Corporate Fitness for {topic}", tag: "Corporate Wellness" },
    { catSlug: "pregnancy", title: "Safe Trimester Workout & Prenatal Care for {topic}", tag: "Pregnancy" },
    { catSlug: "postpartum", title: "Diastasis Recti & Core Rehabilitation for {topic}", tag: "Postpartum" },
    { catSlug: "mens-health", title: "Testosterone Boosting & Male Fitness for {topic}", tag: "Men's Health" },
    { catSlug: "gut-health", title: "Probiotics & Bloating Cure in Indian Diets for {topic}", tag: "Gut Health" },
    { catSlug: "indian-diets", title: "Macro-Balanced South & North Indian Thali Guide for {topic}", tag: "Indian Diets" },
    { catSlug: "regional-indian-foods", title: "Nutritional Deep-Dive on Dosa, Idli, & Sattu for {topic}", tag: "Regional Indian Foods" },
    { catSlug: "meal-plans", title: "7-Day Indian Meal Prep Schedule for {topic}", tag: "Meal Plans" },
    { catSlug: "comparisons", title: "Head to Head Analysis: {topic}", tag: "Comparisons" },
    { catSlug: "calculators", title: "How to Use Caloric & Macro Calculators for {topic}", tag: "Calculators" },
    { catSlug: "bangalore-local-guides", title: "At-Home Personal Fitness Coaching in {topic} Bangalore", tag: "Bangalore Local Guides" },
    { catSlug: "nri-fitness", title: "Maintaining Indian Meals & Fitness Abroad for {topic}", tag: "NRI Fitness" },
    { catSlug: "healthy-habits", title: "Habit Stacking & 30-Day Consistency Rule for {topic}", tag: "Healthy Habits" },
    { catSlug: "fitness-science", title: "Decoding Peer-Reviewed Exercise Research for {topic}", tag: "Fitness Science" },
  ];

  // Specific topic variations to reach 500+ articles
  const variations = [
    "Busy IT Professionals",
    "Vegetarians",
    "Beginners Over 30",
    "Desk Workers",
    "Post-Workout Recovery",
    "Fat Burning",
    "Hormonal Balance",
    "Metabolic Flexibility",
    "Muscle Retention",
    "Energy Boost",
    "Night Shift Workers",
    "Budget Meal Planning",
  ];

  let idCounter = 5;

  topicTemplates.forEach((template) => {
    variations.forEach((varItem) => {
      const title = template.title.replace("{topic}", varItem);
      const catSlugs = SEO_SLUG_MAP[template.catSlug];
      const slug = catSlugs?.[varItem] || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

      const catObj = CATEGORIES_DATA.find((c) => c.slug === template.catSlug);
      const catId = catObj ? catObj.id : "cat-1";
      const authorId = authors[idCounter % authors.length];
      const readingTime = 5 + (idCounter % 5);

      const topicImages = [
        "100g-protein-vegetarian-indian-diet.webp",
        "high-protein-paneer-bhurji-recipe.webp",
        "gym-vs-home-workouts-comparison.webp",
        "pcos-weight-loss-insulin-resistance-guide.webp",
        "indian-protein-sources-ranked.webp",
        "keto-vs-low-carb-indian-diet.webp",
        "intermittent-fasting-indian-lifestyle.webp",
        "thyroid-weight-loss-diet-plan.webp",
        "diabetes-friendly-indian-recipes.webp",
        "prenatal-postnatal-yoga-guide.webp",
        "creatine-monohydrate-guide-india.webp",
        "whey-protein-isolate-vs-concentrate.webp",
        "fat-loss-workout-routine-home.webp",
        "muscle-hypertrophy-home-gym.webp",
        "high-protein-sattu-shake-recipe.webp",
        "low-calorie-paneer-tikka-recipe.webp",
        "gut-health-indian-superfoods.webp",
        "fatty-liver-reversal-diet-chart.webp",
      ];
      const topicImg = topicImages[idCounter % topicImages.length];

      const expanded = EXPANDED_CONTENT[slug];

      const defaultContent = {
        keyTakeaways: [
          `Key insight for ${varItem}: Prioritize protein & consistency over extreme restrictions.`,
          "Consistency with home workouts yields 3x higher retention than erratic gym visits.",
          "Always align your caloric intake with your daily physical activity expenditure.",
        ],
        medicalDisclaimer: true,
        coachReviewBadge: "Verified by FitVed Editorial & Clinical Board",
        blocks: [
          {
            type: "paragraph" as const,
            content: `Understanding ${title} is crucial for long-term health and sustainable results. Whether you are aiming for fat loss, muscle tone, or higher daily energy, this guide provides clear, practical steps for Indian households.`,
          },
          {
            type: "heading" as const,
            level: 2 as const,
            title: `Core Principles of ${template.tag}`,
          },
          {
            type: "paragraph" as const,
            content: `To achieve optimal results with ${varItem}, focus on balanced nutrition, progressive physical activity, and adequate recovery sleep. Small daily adjustments compound into major health transformations over 90 days.`,
          },
          {
            type: "callout" as const,
            title: "Actionable Takeaway",
            content: `Incorporate whole Indian foods like chana, sprouts, paneer, and green leafy vegetables while maintaining a daily 7,000 to 10,000 step count.`,
          },
        ],
      };

      const defaultFaq = [
        {
          question: `How long does it take to see results with ${title}?`,
          answer: "Most individuals notice improved energy in 2 weeks and measurable physical progress within 4 to 6 weeks of consistent habit adoption.",
        },
        {
          question: "Is this suitable for beginners?",
          answer: "Yes, all routines and meal advice are scalable for beginners as well as intermediate fitness enthusiasts.",
        },
      ];

      generated.push({
        id: `art-${idCounter}`,
        title,
        display_title: expanded?.display_title || getEditorialDisplayTitle(template.catSlug, varItem, title),
        slug,
        summary: expanded?.summary || `Comprehensive science-backed guide on ${title}. Learn actionable steps, Indian meal charts, and workout strategies calibrated for long-term health.`,
        featured_image: resolveFeaturedImage({ title, slug }),
        published_at: new Date(Date.now() - idCounter * 86400000).toISOString(),
        updated_at: new Date().toISOString(),
        reading_time: expanded?.reading_time || readingTime,
        tags: [template.tag, varItem, "Indian Fitness"],
        category_id: catId,
        author_id: authorId,
        is_featured: false,
        is_editor_pick: idCounter % 15 === 0,
        is_popular: idCounter % 8 === 0,
        published: true,
        seo_title: expanded?.seo_title || `${title} | FitVed Journal`,
        seo_description: expanded?.seo_description || `Read the complete guide on ${title}. Step-by-step advice, Indian food charts, and expert coaching tips from FitVed.`,
        canonical_url: `https://www.getfitved.com/blog/article/${slug}`,
        keywords: expanded?.keywords,
        image_alt: expanded?.image_alt,
        content: expanded?.content || defaultContent,
        faq_schema: expanded?.faq_schema || defaultFaq,
      });

      idCounter++;
    });
  });

  return generated;
}

// Blog content: the 4 detailed curated articles + the hand-researched set are
// shown first (best quality), followed by the full programmatic catalogue so
// no existing article is ever removed.
export const ARTICLES_DATA: BlogArticle[] = [
  ...CURATED_ARTICLES,
  ...RESEARCHED_ARTICLES,
  ...generateProgrammaticArticles(),
];
