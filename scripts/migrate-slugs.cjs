/**
 * SEO URL Slug Migration Script
 *
 * Generates a deterministic old→new slug mapping for all 521 blog articles,
 * updates expanded JSON file keys, and outputs the redirect map.
 *
 * Run: node scripts/migrate-slugs.cjs
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const EXPANDED_DIR = path.join(ROOT, "src/data/blog/expanded");
const RESEARCHED_PATH = path.join(ROOT, "src/data/blog/researchedArticles.json");

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// ============================================================
// 1. CURATED ARTICLE SLUG MAP (4 articles)
// ============================================================
const CURATED_SLUG_MAP = {
  "100g-protein-vegetarian-indian-diet": "100g-protein-vegetarian-diet",
  "high-protein-paneer-bhurji-recipe": "protein-paneer-bhurji",
  "gym-vs-home-workouts-comparison": "gym-vs-home-workouts",
  "pcos-weight-loss-insulin-resistance-guide": "pcos-weight-loss",
};

// ============================================================
// 2. RESEARCHED ARTICLE SLUG MAP (13 articles)
// ============================================================
const RESEARCHED_SLUG_MAP = {
  "how-much-protein-per-day-indian": "daily-protein-intake",
  "best-vegetarian-protein-sources-india": "vegetarian-protein-sources",
  "moong-dal-chilla-recipe": "high-protein-moong-dal-chilla",
  "soya-chunks-protein-benefits": "soya-chunks-protein",
  "how-to-lose-belly-fat-indian-diet": "lose-belly-fat-indian-diet",
  "calorie-deficit-explained-indian-food": "calorie-deficit-indian-food",
  "walking-for-weight-loss-steps": "walking-for-weight-loss",
  "pcos-diet-plan-indian": "pcos-diet-plan",
  "low-gi-indian-foods-diabetes": "low-gi-indian-foods",
  "creatine-guide-india": "creatine-for-beginners",
  "vitamin-d-deficiency-india": "vitamin-d-deficiency",
  "beginner-home-workout-no-equipment": "beginner-home-workout",
  "whey-vs-plant-protein-comparison": "whey-vs-plant-protein",
};

// ============================================================
// 3. PROGRAMMATIC ARTICLE SLUG MAP (42 categories × 12 variations = 504)
// ============================================================
// Each category maps variation → new SEO slug
const PROGRAMMATIC_SEO_SLUGS = {
  nutrition: {
    "Busy IT Professionals": "it-professional-diet",
    "Vegetarians": "indian-vegetarian-diet",
    "Beginners Over 30": "indian-diet-after-30",
    "Desk Workers": "desk-job-diet",
    "Post-Workout Recovery": "post-workout-nutrition",
    "Fat Burning": "indian-diet-for-fat-loss",
    "Hormonal Balance": "diet-for-hormonal-health",
    "Metabolic Flexibility": "metabolic-flexibility-diet",
    "Muscle Retention": "muscle-retention-diet",
    "Energy Boost": "indian-foods-for-energy",
    "Night Shift Workers": "night-shift-diet",
    "Budget Meal Planning": "budget-indian-meal-plan",
  },
  "weight-loss": {
    "Busy IT Professionals": "fat-loss-for-it-professionals",
    "Vegetarians": "vegetarian-fat-loss-diet",
    "Beginners Over 30": "fat-loss-after-30",
    "Desk Workers": "desk-job-fat-loss",
    "Post-Workout Recovery": "recovery-and-fat-loss",
    "Fat Burning": "fat-loss-without-crash-dieting",
    "Hormonal Balance": "hormonal-health-and-fat-loss",
    "Metabolic Flexibility": "metabolic-flexibility-for-fat-loss",
    "Muscle Retention": "keep-muscle-while-losing-fat",
    "Energy Boost": "energy-during-fat-loss",
    "Night Shift Workers": "night-shift-fat-loss",
    "Budget Meal Planning": "budget-fat-loss-meal-plan",
  },
  "muscle-gain": {
    "Busy IT Professionals": "muscle-building-for-it-professionals",
    "Vegetarians": "vegetarian-muscle-building",
    "Beginners Over 30": "muscle-building-after-30",
    "Desk Workers": "strength-training-for-desk-workers",
    "Post-Workout Recovery": "post-workout-muscle-recovery",
    "Fat Burning": "build-muscle-while-losing-fat",
    "Hormonal Balance": "training-and-hormonal-health",
    "Metabolic Flexibility": "metabolic-health-for-muscle-growth",
    "Muscle Retention": "build-and-keep-muscle",
    "Energy Boost": "strength-and-energy-nutrition",
    "Night Shift Workers": "muscle-building-night-shifts",
    "Budget Meal Planning": "budget-muscle-building-diet",
  },
  protein: {
    "Busy IT Professionals": "protein-foods-for-it-professionals",
    "Vegetarians": "vegetarian-protein-foods",
    "Beginners Over 30": "protein-foods-after-30",
    "Desk Workers": "protein-foods-for-desk-workers",
    "Post-Workout Recovery": "post-workout-recovery-foods",
    "Fat Burning": "protein-for-fat-loss",
    "Hormonal Balance": "protein-for-hormonal-health",
    "Metabolic Flexibility": "protein-first-meal-planning",
    "Muscle Retention": "leucine-rich-indian-protein-foods",
    "Energy Boost": "protein-foods-for-energy",
    "Night Shift Workers": "night-shift-protein-foods",
    "Budget Meal Planning": "affordable-protein-foods",
  },
  recipes: {
    "Busy IT Professionals": "quick-protein-meals-for-office",
    "Vegetarians": "vegetarian-protein-meals",
    "Beginners Over 30": "nutrient-dense-indian-recipes",
    "Desk Workers": "desk-friendly-lunch-recipes",
    "Post-Workout Recovery": "post-workout-meals-and-shakes",
    "Fat Burning": "low-calorie-indian-recipes",
    "Hormonal Balance": "hormone-friendly-recipes",
    "Metabolic Flexibility": "carb-periodized-meals",
    "Muscle Retention": "protein-packed-daily-meals",
    "Energy Boost": "midday-energy-boosting-recipes",
    "Night Shift Workers": "night-shift-snack-recipes",
    "Budget Meal Planning": "budget-protein-batch-recipes",
  },
  supplements: {
    "Busy IT Professionals": "supplements-for-busy-professionals",
    "Vegetarians": "supplements-for-vegetarians",
    "Beginners Over 30": "supplements-after-30",
    "Desk Workers": "supplements-for-desk-workers",
    "Post-Workout Recovery": "workout-recovery-supplements",
    "Fat Burning": "fat-loss-supplements",
    "Hormonal Balance": "supplements-for-hormonal-health",
    "Metabolic Flexibility": "supplements-for-metabolic-health",
    "Muscle Retention": "supplements-for-muscle-retention",
    "Energy Boost": "supplements-for-energy",
    "Night Shift Workers": "night-shift-supplements",
    "Budget Meal Planning": "budget-supplements-india",
  },
  "womens-health": {
    "Busy IT Professionals": "womens-health-for-tech-professionals",
    "Vegetarians": "vegetarian-womens-health",
    "Beginners Over 30": "womens-health-after-30",
    "Desk Workers": "desk-work-and-womens-health",
    "Post-Workout Recovery": "womens-workout-recovery",
    "Fat Burning": "womens-fat-loss-blueprint",
    "Hormonal Balance": "womens-hormonal-balance",
    "Metabolic Flexibility": "womens-metabolic-health",
    "Muscle Retention": "strength-training-for-women",
    "Energy Boost": "overcoming-fatigue-for-women",
    "Night Shift Workers": "womens-health-night-shifts",
    "Budget Meal Planning": "budget-womens-wellness",
  },
  pcos: {
    "Busy IT Professionals": "pcos-management-at-desk-jobs",
    "Vegetarians": "pcos-diet-for-vegetarians",
    "Beginners Over 30": "pcos-management-after-30",
    "Desk Workers": "pcos-exercises-for-desk-workers",
    "Post-Workout Recovery": "post-workout-pcos-recovery",
    "Fat Burning": "pcos-insulin-resistance-weight-loss",
    "Hormonal Balance": "pcos-hormone-balance-protocol",
    "Metabolic Flexibility": "metabolic-flexibility-and-pcos",
    "Muscle Retention": "muscle-retention-on-pcos-diet",
    "Energy Boost": "boosting-energy-with-pcos",
    "Night Shift Workers": "pcos-on-night-shift-schedules",
    "Budget Meal Planning": "budget-pcos-meal-plan",
  },
  diabetes: {
    "Busy IT Professionals": "blood-sugar-control-at-desk-jobs",
    "Vegetarians": "vegetarian-blood-sugar-management",
    "Beginners Over 30": "managing-hba1c-after-30",
    "Desk Workers": "prevent-blood-sugar-spikes-sitting",
    "Post-Workout Recovery": "exercise-and-blood-sugar",
    "Fat Burning": "fat-loss-with-type-2-diabetes",
    "Hormonal Balance": "insulin-sensitivity-and-hormones",
    "Metabolic Flexibility": "metabolic-flexibility-in-diabetes",
    "Muscle Retention": "muscle-mass-with-high-blood-sugar",
    "Energy Boost": "beating-diabetic-fatigue",
    "Night Shift Workers": "blood-sugar-on-night-shifts",
    "Budget Meal Planning": "affordable-diabetes-friendly-foods",
  },
  "heart-health": {
    "Busy IT Professionals": "heart-health-for-it-professionals",
    "Vegetarians": "plant-based-heart-health",
    "Beginners Over 30": "cardiovascular-wellness-after-30",
    "Desk Workers": "heart-health-for-desk-workers",
    "Post-Workout Recovery": "post-exercise-heart-recovery",
    "Fat Burning": "fat-loss-for-better-cholesterol",
    "Hormonal Balance": "hormonal-and-heart-health",
    "Metabolic Flexibility": "metabolic-health-for-strong-heart",
    "Muscle Retention": "heart-health-and-muscle-tone",
    "Energy Boost": "cardiovascular-energy-boosters",
    "Night Shift Workers": "heart-health-for-shift-workers",
    "Budget Meal Planning": "budget-foods-for-heart-health",
  },
  longevity: {
    "Busy IT Professionals": "longevity-for-busy-professionals",
    "Vegetarians": "plant-based-healthy-aging",
    "Beginners Over 30": "cellular-vitality-after-30",
    "Desk Workers": "combating-sedentary-aging",
    "Post-Workout Recovery": "recovery-for-anti-aging",
    "Fat Burning": "fat-loss-for-longevity",
    "Hormonal Balance": "hormone-optimization-with-age",
    "Metabolic Flexibility": "metabolic-flexibility-for-longevity",
    "Muscle Retention": "preserving-muscle-for-longevity",
    "Energy Boost": "sustained-energy-for-longevity",
    "Night Shift Workers": "circadian-health-and-longevity",
    "Budget Meal Planning": "affordable-anti-aging-foods",
  },
  sleep: {
    "Busy IT Professionals": "sleep-for-high-stress-jobs",
    "Vegetarians": "plant-based-foods-for-sleep",
    "Beginners Over 30": "optimizing-sleep-after-30",
    "Desk Workers": "sleeping-better-after-desk-work",
    "Post-Workout Recovery": "post-workout-sleep-recovery",
    "Fat Burning": "sleep-optimization-for-fat-loss",
    "Hormonal Balance": "sleep-and-hormone-regulation",
    "Metabolic Flexibility": "metabolic-benefits-of-quality-sleep",
    "Muscle Retention": "sleep-for-muscle-retention",
    "Energy Boost": "restorative-sleep-for-energy",
    "Night Shift Workers": "mastering-sleep-on-night-shifts",
    "Budget Meal Planning": "low-cost-better-sleep-habits",
  },
  stress: {
    "Busy IT Professionals": "de-stressing-after-work",
    "Vegetarians": "plant-based-stress-relief",
    "Beginners Over 30": "managing-cortisol-after-30",
    "Desk Workers": "office-desk-stress-relief",
    "Post-Workout Recovery": "stress-recovery-for-active-adults",
    "Fat Burning": "stress-induced-weight-gain",
    "Hormonal Balance": "cortisol-and-hormonal-balance",
    "Metabolic Flexibility": "stress-and-metabolic-health",
    "Muscle Retention": "protecting-muscle-from-cortisol",
    "Energy Boost": "overcoming-stress-and-brain-fog",
    "Night Shift Workers": "stress-management-night-shifts",
    "Budget Meal Planning": "free-daily-stress-fixes",
  },
  "workplace-fitness": {
    "Busy IT Professionals": "desk-ergonomics-for-engineers",
    "Vegetarians": "vegetarian-lunchbox-for-work",
    "Beginners Over 30": "workplace-fitness-after-30",
    "Desk Workers": "5-minute-desk-stretching",
    "Post-Workout Recovery": "post-work-recovery-exercises",
    "Fat Burning": "desk-worker-fat-loss-plan",
    "Hormonal Balance": "workplace-wellness-and-hormones",
    "Metabolic Flexibility": "metabolic-health-at-work",
    "Muscle Retention": "retaining-muscle-with-desk-jobs",
    "Energy Boost": "beating-3pm-office-slump",
    "Night Shift Workers": "workplace-fitness-night-shifts",
    "Budget Meal Planning": "budget-workstation-health-hacks",
  },
  "home-workouts": {
    "Busy IT Professionals": "20-minute-home-workouts",
    "Vegetarians": "no-equipment-workouts-vegetarian",
    "Beginners Over 30": "home-strength-training-after-30",
    "Desk Workers": "quick-home-workouts-for-desk-workers",
    "Post-Workout Recovery": "home-workout-recovery-techniques",
    "Fat Burning": "home-caloric-burn-blueprint",
    "Hormonal Balance": "home-fitness-for-hormonal-health",
    "Metabolic Flexibility": "metabolic-conditioning-at-home",
    "Muscle Retention": "building-muscle-at-home",
    "Energy Boost": "quick-home-workouts-for-energy",
    "Night Shift Workers": "night-shift-home-workout",
    "Budget Meal Planning": "zero-cost-home-workout",
  },
  gym: {
    "Busy IT Professionals": "gym-routines-for-busy-schedules",
    "Vegetarians": "gym-workouts-for-vegetarian-lifters",
    "Beginners Over 30": "weight-training-after-30",
    "Desk Workers": "gym-guide-for-desk-sitters",
    "Post-Workout Recovery": "post-gym-recovery-and-repair",
    "Fat Burning": "gym-workouts-for-fat-loss",
    "Hormonal Balance": "hormone-optimized-weight-training",
    "Metabolic Flexibility": "fueling-heavy-gym-lifts",
    "Muscle Retention": "gym-hypertrophy-and-retention",
    "Energy Boost": "high-energy-gym-training",
    "Night Shift Workers": "gym-timing-for-night-shifts",
    "Budget Meal Planning": "budget-gym-workouts",
  },
  yoga: {
    "Busy IT Professionals": "desk-yoga-for-tech-stress",
    "Vegetarians": "gentle-yoga-for-vegetarians",
    "Beginners Over 30": "yoga-and-flexibility-after-30",
    "Desk Workers": "desk-yoga-for-posture",
    "Post-Workout Recovery": "post-workout-yoga-recovery",
    "Fat Burning": "yoga-for-weight-management",
    "Hormonal Balance": "yoga-for-hormonal-balance",
    "Metabolic Flexibility": "yoga-for-digestive-health",
    "Muscle Retention": "yoga-for-core-stability",
    "Energy Boost": "morning-yoga-for-energy",
    "Night Shift Workers": "yoga-for-night-shift-relaxation",
    "Budget Meal Planning": "free-daily-home-yoga",
  },
  running: {
    "Busy IT Professionals": "5k-training-on-tight-schedule",
    "Vegetarians": "plant-based-fueling-for-runners",
    "Beginners Over 30": "running-safely-after-30",
    "Desk Workers": "running-for-desk-sitters",
    "Post-Workout Recovery": "post-run-recovery-guide",
    "Fat Burning": "running-for-fat-loss",
    "Hormonal Balance": "running-and-hormonal-balance",
    "Metabolic Flexibility": "metabolic-fueling-for-runners",
    "Muscle Retention": "retaining-muscle-as-a-runner",
    "Energy Boost": "running-for-stamina-and-focus",
    "Night Shift Workers": "running-schedules-for-night-workers",
    "Budget Meal Planning": "budget-running-tips",
  },
  mobility: {
    "Busy IT Professionals": "hip-mobility-for-desk-sitters",
    "Vegetarians": "mobility-routines-for-vegetarians",
    "Beginners Over 30": "joint-mobility-after-30",
    "Desk Workers": "desk-sitting-mobility-hacks",
    "Post-Workout Recovery": "post-workout-mobility-drills",
    "Fat Burning": "mobility-for-fat-loss-workouts",
    "Hormonal Balance": "mobility-for-hormonal-ease",
    "Metabolic Flexibility": "mobility-for-better-movement",
    "Muscle Retention": "joint-protection-and-muscle",
    "Energy Boost": "mobility-drills-for-morning-energy",
    "Night Shift Workers": "mobility-for-shift-workers",
    "Budget Meal Planning": "daily-zero-cost-mobility-flow",
  },
  recovery: {
    "Busy IT Professionals": "faster-workout-recovery",
    "Vegetarians": "plant-based-recovery-foods",
    "Beginners Over 30": "muscle-recovery-after-30",
    "Desk Workers": "recovery-exercises-for-desk-workers",
    "Post-Workout Recovery": "doms-relief-and-recovery",
    "Fat Burning": "recovery-during-fat-loss",
    "Hormonal Balance": "hormonal-balance-and-recovery",
    "Metabolic Flexibility": "metabolic-recovery-between-workouts",
    "Muscle Retention": "muscle-protein-synthesis-recovery",
    "Energy Boost": "restoring-energy-after-lifting",
    "Night Shift Workers": "recovery-for-night-shift-lifters",
    "Budget Meal Planning": "budget-muscle-recovery",
  },
  injuries: {
    "Busy IT Professionals": "lower-back-pain-from-sitting",
    "Vegetarians": "plant-based-nutrition-for-injury-rehab",
    "Beginners Over 30": "injury-prevention-after-30",
    "Desk Workers": "rehab-exercises-for-sitting-strain",
    "Post-Workout Recovery": "post-injury-workout-recovery",
    "Fat Burning": "safe-fat-loss-during-rehab",
    "Hormonal Balance": "hormonal-health-and-tissue-healing",
    "Metabolic Flexibility": "metabolic-health-during-rehab",
    "Muscle Retention": "retaining-muscle-while-injured",
    "Energy Boost": "rebuilding-energy-after-injury",
    "Night Shift Workers": "rehab-exercises-for-night-shifts",
    "Budget Meal Planning": "zero-cost-injury-prevention",
  },
  creatine: {
    "Busy IT Professionals": "creatine-for-desk-workers",
    "Vegetarians": "creatine-for-vegetarians",
    "Beginners Over 30": "creatine-benefits-after-30",
    "Desk Workers": "creatine-monohydrate-for-sedentary",
    "Post-Workout Recovery": "creatine-for-post-workout-recovery",
    "Fat Burning": "creatine-during-fat-loss",
    "Hormonal Balance": "creatine-and-hormonal-health",
    "Metabolic Flexibility": "creatine-for-cellular-energy",
    "Muscle Retention": "creatine-loading-for-muscle",
    "Energy Boost": "creatine-for-mental-alertness",
    "Night Shift Workers": "creatine-timing-for-night-shifts",
    "Budget Meal Planning": "best-creatine-brands-india",
  },
  "whey-protein": {
    "Busy IT Professionals": "whey-isolate-vs-concentrate",
    "Vegetarians": "whey-protein-for-vegetarians",
    "Beginners Over 30": "whey-protein-after-30",
    "Desk Workers": "whey-shakes-for-desk-workers",
    "Post-Workout Recovery": "post-workout-whey-protein",
    "Fat Burning": "whey-protein-in-caloric-deficit",
    "Hormonal Balance": "whey-protein-and-hormones",
    "Metabolic Flexibility": "whey-protein-for-metabolic-support",
    "Muscle Retention": "whey-isolate-for-muscle-retention",
    "Energy Boost": "whey-protein-for-quick-energy",
    "Night Shift Workers": "whey-protein-for-shift-workers",
    "Budget Meal Planning": "cheapest-whey-protein-india",
  },
  vitamins: {
    "Busy IT Professionals": "vitamin-d-deficiency-in-offices",
    "Vegetarians": "essential-vitamins-for-vegetarians",
    "Beginners Over 30": "vitamin-d3-and-b12-after-30",
    "Desk Workers": "vitamins-for-sedentary-workers",
    "Post-Workout Recovery": "vitamins-for-exercise-recovery",
    "Fat Burning": "vitamin-deficiency-and-weight-loss",
    "Hormonal Balance": "vitamins-for-hormonal-regulation",
    "Metabolic Flexibility": "vitamins-for-metabolic-efficiency",
    "Muscle Retention": "vitamins-for-muscle-health",
    "Energy Boost": "vitamins-for-brain-fog-and-fatigue",
    "Night Shift Workers": "vitamin-protocols-for-night-shifts",
    "Budget Meal Planning": "budget-vitamin-sources-india",
  },
  "fat-loss": {
    "Busy IT Professionals": "smart-fat-loss-for-professionals",
    "Vegetarians": "vegetarian-fat-loss-blueprint",
    "Beginners Over 30": "sustainable-fat-loss-after-30",
    "Desk Workers": "fat-loss-for-sitting-all-day",
    "Post-Workout Recovery": "fat-loss-and-muscle-preservation",
    "Fat Burning": "accelerating-fat-loss-at-home",
    "Hormonal Balance": "fat-loss-and-hormonal-health",
    "Metabolic Flexibility": "boosting-metabolic-rate",
    "Muscle Retention": "keeping-muscle-while-dropping-fat",
    "Energy Boost": "fat-loss-without-losing-energy",
    "Night Shift Workers": "fat-loss-for-shift-workers",
    "Budget Meal Planning": "affordable-fat-loss-foods",
  },
  "beginner-guides": {
    "Busy IT Professionals": "fitness-for-busy-beginners",
    "Vegetarians": "beginner-fitness-for-vegetarians",
    "Beginners Over 30": "starting-fitness-after-30",
    "Desk Workers": "beginner-workout-for-desk-sitters",
    "Post-Workout Recovery": "beginner-recovery-guide",
    "Fat Burning": "beginner-fat-loss-blueprint",
    "Hormonal Balance": "beginner-guide-to-hormonal-health",
    "Metabolic Flexibility": "understanding-metabolism-for-beginners",
    "Muscle Retention": "beginner-muscle-retention",
    "Energy Boost": "beginner-guide-to-all-day-energy",
    "Night Shift Workers": "beginner-fitness-for-night-shifts",
    "Budget Meal Planning": "budget-beginner-fitness",
  },
  "senior-fitness": {
    "Busy IT Professionals": "staying-fit-after-40-at-work",
    "Vegetarians": "vegetarian-active-aging",
    "Beginners Over 30": "strength-and-mobility-after-40",
    "Desk Workers": "senior-fitness-for-desk-workers",
    "Post-Workout Recovery": "active-aging-recovery",
    "Fat Burning": "weight-management-after-40",
    "Hormonal Balance": "hormones-and-vitality-after-40",
    "Metabolic Flexibility": "metabolic-health-in-active-aging",
    "Muscle Retention": "preserving-muscle-after-40",
    "Energy Boost": "boosting-energy-after-40",
    "Night Shift Workers": "active-aging-for-shift-workers",
    "Budget Meal Planning": "affordable-fitness-for-older-adults",
  },
  "kids-nutrition": {
    "Busy IT Professionals": "quick-healthy-tiffins-for-kids",
    "Vegetarians": "vegetarian-kid-protein-hacks",
    "Beginners Over 30": "nutrition-for-growing-children",
    "Desk Workers": "healthy-eating-for-students",
    "Post-Workout Recovery": "child-activity-nutrition",
    "Fat Burning": "healthy-weight-for-children",
    "Hormonal Balance": "hormonal-balance-in-child-growth",
    "Metabolic Flexibility": "metabolic-health-in-growing-kids",
    "Muscle Retention": "protein-needs-for-kids",
    "Energy Boost": "morning-foods-for-student-energy",
    "Night Shift Workers": "meal-tips-for-shift-worker-parents",
    "Budget Meal Planning": "budget-healthy-school-snacks",
  },
  "corporate-wellness": {
    "Busy IT Professionals": "corporate-health-for-tech-teams",
    "Vegetarians": "vegetarian-corporate-wellness",
    "Beginners Over 30": "corporate-wellness-after-30",
    "Desk Workers": "office-desk-health-programs",
    "Post-Workout Recovery": "employee-wellness-protocols",
    "Fat Burning": "corporate-fat-loss-challenges",
    "Hormonal Balance": "corporate-stress-and-hormonal-relief",
    "Metabolic Flexibility": "executive-metabolic-health",
    "Muscle Retention": "retaining-strength-in-corporate-jobs",
    "Energy Boost": "boosting-employee-energy",
    "Night Shift Workers": "corporate-wellness-night-shifts",
    "Budget Meal Planning": "cost-effective-corporate-wellness",
  },
  pregnancy: {
    "Busy IT Professionals": "working-through-pregnancy-in-tech",
    "Vegetarians": "vegetarian-prenatal-nutrition",
    "Beginners Over 30": "safe-exercise-during-pregnancy",
    "Desk Workers": "desk-comfort-during-pregnancy",
    "Post-Workout Recovery": "post-exercise-recovery-in-pregnancy",
    "Fat Burning": "healthy-weight-in-pregnancy",
    "Hormonal Balance": "hormonal-changes-in-pregnancy",
    "Metabolic Flexibility": "metabolic-health-for-expectant-mothers",
    "Muscle Retention": "muscle-strength-in-pregnancy",
    "Energy Boost": "maintaining-energy-during-pregnancy",
    "Night Shift Workers": "managing-pregnancy-on-shifts",
    "Budget Meal Planning": "budget-prenatal-nutrition",
  },
  postpartum: {
    "Busy IT Professionals": "returning-to-work-postpartum",
    "Vegetarians": "vegetarian-postpartum-recovery",
    "Beginners Over 30": "rebuilding-strength-postpartum",
    "Desk Workers": "postpartum-core-rehab-desk-sitters",
    "Post-Workout Recovery": "postpartum-muscle-recovery",
    "Fat Burning": "safe-postpartum-fat-loss",
    "Hormonal Balance": "postpartum-hormonal-recovery",
    "Metabolic Flexibility": "metabolic-recovery-after-childbirth",
    "Muscle Retention": "diastasis-recti-rehabilitation",
    "Energy Boost": "beating-postpartum-fatigue",
    "Night Shift Workers": "postpartum-care-for-shift-workers",
    "Budget Meal Planning": "affordable-postpartum-recovery",
  },
  "mens-health": {
    "Busy IT Professionals": "mens-energy-and-testosterone-at-work",
    "Vegetarians": "vegetarian-mens-health",
    "Beginners Over 30": "mens-health-after-30",
    "Desk Workers": "posture-and-health-for-men",
    "Post-Workout Recovery": "exercise-recovery-for-men",
    "Fat Burning": "mens-fat-loss-and-muscle",
    "Hormonal Balance": "testosterone-and-hormonal-health",
    "Metabolic Flexibility": "metabolic-optimization-for-men",
    "Muscle Retention": "building-muscle-mass-for-men",
    "Energy Boost": "all-day-energy-for-men",
    "Night Shift Workers": "mens-health-night-shifts",
    "Budget Meal Planning": "budget-mens-fitness",
  },
  "gut-health": {
    "Busy IT Professionals": "office-bloating-and-indigestion",
    "Vegetarians": "probiotic-foods-for-vegetarians",
    "Beginners Over 30": "gut-health-after-30",
    "Desk Workers": "desk-sitting-and-digestive-health",
    "Post-Workout Recovery": "gut-health-and-exercise-recovery",
    "Fat Burning": "gut-microbes-and-weight-loss",
    "Hormonal Balance": "gut-hormone-connection",
    "Metabolic Flexibility": "metabolism-through-gut-health",
    "Muscle Retention": "gut-health-for-nutrient-absorption",
    "Energy Boost": "gut-health-and-low-energy",
    "Night Shift Workers": "gut-health-for-night-shifts",
    "Budget Meal Planning": "cheap-probiotic-indian-foods",
  },
  "indian-diets": {
    "Busy IT Professionals": "indian-lunchboxes-for-office",
    "Vegetarians": "high-protein-indian-thali-vegetarian",
    "Beginners Over 30": "indian-meals-after-30",
    "Desk Workers": "indian-thali-for-desk-workers",
    "Post-Workout Recovery": "post-workout-indian-thali",
    "Fat Burning": "indian-home-food-for-fat-loss",
    "Hormonal Balance": "indian-diet-for-hormonal-health",
    "Metabolic Flexibility": "metabolic-flexibility-indian-meals",
    "Muscle Retention": "preserving-muscle-on-indian-diet",
    "Energy Boost": "high-energy-indian-meals",
    "Night Shift Workers": "indian-diet-for-night-shifts",
    "Budget Meal Planning": "budget-indian-thali",
  },
  "regional-indian-foods": {
    "Busy IT Professionals": "healthy-south-north-indian-quick-bites",
    "Vegetarians": "protein-in-dosa-idli-sattu",
    "Beginners Over 30": "regional-indian-superfoods-after-30",
    "Desk Workers": "light-regional-dishes-for-lunch",
    "Post-Workout Recovery": "post-workout-regional-meals",
    "Fat Burning": "regional-indian-foods-for-fat-loss",
    "Hormonal Balance": "regional-indian-ingredients-for-hormones",
    "Metabolic Flexibility": "fermented-indian-foods-for-metabolism",
    "Muscle Retention": "high-protein-regional-indian-foods",
    "Energy Boost": "energy-boosting-regional-beverages",
    "Night Shift Workers": "regional-indian-snacks-night-shifts",
    "Budget Meal Planning": "economical-regional-indian-foods",
  },
  "meal-plans": {
    "Busy IT Professionals": "sunday-batch-cooking-for-work",
    "Vegetarians": "7-day-vegetarian-meal-prep",
    "Beginners Over 30": "7-day-meal-plan-after-30",
    "Desk Workers": "7-day-meal-prep-for-desk-workers",
    "Post-Workout Recovery": "7-day-recovery-meal-plan",
    "Fat Burning": "7-day-fat-loss-meal-plan",
    "Hormonal Balance": "7-day-hormonal-balance-meal-plan",
    "Metabolic Flexibility": "7-day-carb-periodized-meal-plan",
    "Muscle Retention": "7-day-high-protein-muscle-plan",
    "Energy Boost": "7-day-energy-boosting-meal-plan",
    "Night Shift Workers": "7-day-meal-plan-night-shifts",
    "Budget Meal Planning": "7-day-budget-indian-meal-prep",
  },
  comparisons: {
    "Busy IT Professionals": "meal-prep-vs-food-delivery",
    "Vegetarians": "paneer-vs-soya-chunks",
    "Beginners Over 30": "fitness-at-20-vs-after-30",
    "Desk Workers": "gym-vs-home-workouts-for-desk-workers",
    "Post-Workout Recovery": "whey-protein-vs-whole-food-recovery",
    "Fat Burning": "keto-vs-low-carb-indian-diet",
    "Hormonal Balance": "hormones-vs-calories-in-weight-loss",
    "Metabolic Flexibility": "high-carb-vs-low-carb-metabolism",
    "Muscle Retention": "cardio-vs-lifting-for-muscle",
    "Energy Boost": "coffee-vs-sattu-drink",
    "Night Shift Workers": "night-shift-vs-day-shift-fitness",
    "Budget Meal Planning": "home-food-vs-commercial-protein",
  },
  calculators: {
    "Busy IT Professionals": "calorie-calculator-for-desk-jobs",
    "Vegetarians": "caloric-needs-for-vegetarians",
    "Beginners Over 30": "macro-calculator-after-30",
    "Desk Workers": "tdee-calculator-for-desk-workers",
    "Post-Workout Recovery": "post-workout-macro-calculator",
    "Fat Burning": "caloric-deficit-calculator",
    "Hormonal Balance": "macro-counting-for-hormonal-health",
    "Metabolic Flexibility": "metabolic-flexibility-calculator",
    "Muscle Retention": "protein-target-calculator",
    "Energy Boost": "energy-needs-calculator",
    "Night Shift Workers": "calorie-shift-timing-calculator",
    "Budget Meal Planning": "free-calorie-macro-calculator",
  },
  "bangalore-local-guides": {
    "Busy IT Professionals": "personal-trainer-whitefield-hsr",
    "Vegetarians": "vegetarian-home-trainer-bangalore",
    "Beginners Over 30": "home-fitness-bangalore-after-30",
    "Desk Workers": "home-coaching-for-desk-workers-bangalore",
    "Post-Workout Recovery": "recovery-coaching-bangalore",
    "Fat Burning": "weight-loss-coaching-bangalore",
    "Hormonal Balance": "pcos-fitness-coaching-bangalore",
    "Metabolic Flexibility": "metabolic-fitness-trainer-bangalore",
    "Muscle Retention": "muscle-building-coaching-bangalore",
    "Energy Boost": "energy-fitness-coaching-bangalore",
    "Night Shift Workers": "night-shift-personal-trainer-bangalore",
    "Budget Meal Planning": "affordable-personal-trainer-bangalore",
  },
  "nri-fitness": {
    "Busy IT Professionals": "nri-fitness-for-tech-professionals",
    "Vegetarians": "indian-vegetarian-diet-abroad",
    "Beginners Over 30": "nri-fitness-after-30",
    "Desk Workers": "nri-fitness-at-desk-jobs",
    "Post-Workout Recovery": "post-workout-recovery-for-nris",
    "Fat Burning": "nri-fat-loss-with-local-foods",
    "Hormonal Balance": "nri-hormonal-and-stress-management",
    "Metabolic Flexibility": "metabolic-flexibility-for-nris",
    "Muscle Retention": "retaining-muscle-living-abroad",
    "Energy Boost": "energy-for-nri-schedules",
    "Night Shift Workers": "nri-fitness-night-shifts",
    "Budget Meal Planning": "budget-fitness-for-nris",
  },
  "healthy-habits": {
    "Busy IT Professionals": "30-day-fitness-habits-at-work",
    "Vegetarians": "30-day-vegetarian-health-habits",
    "Beginners Over 30": "habit-stacking-after-30",
    "Desk Workers": "30-day-desk-health-habits",
    "Post-Workout Recovery": "habit-stacking-for-recovery",
    "Fat Burning": "30-day-fat-loss-consistency",
    "Hormonal Balance": "daily-habits-for-hormonal-balance",
    "Metabolic Flexibility": "metabolic-consistency-habits",
    "Muscle Retention": "30-day-muscle-retention-habits",
    "Energy Boost": "morning-habits-for-high-energy",
    "Night Shift Workers": "night-shift-health-habits",
    "Budget Meal Planning": "zero-cost-daily-healthy-habits",
  },
  "fitness-science": {
    "Busy IT Professionals": "science-of-prolonged-sitting",
    "Vegetarians": "research-on-vegetarian-protein",
    "Beginners Over 30": "exercise-science-and-aging-after-30",
    "Desk Workers": "science-of-sedentary-risks",
    "Post-Workout Recovery": "science-of-muscle-recovery",
    "Fat Burning": "science-of-caloric-deficit",
    "Hormonal Balance": "science-of-cortisol-and-hormones",
    "Metabolic Flexibility": "research-on-metabolic-health",
    "Muscle Retention": "science-of-muscle-protein-synthesis",
    "Energy Boost": "science-of-sleep-and-energy",
    "Night Shift Workers": "circadian-science-for-night-shifts",
    "Budget Meal Planning": "evidence-based-fitness-hacks",
  },
};

// ============================================================
// 4. Generate the old slug for each programmatic article
//    (mirrors articles.ts logic)
// ============================================================
const TOPIC_TEMPLATES = [
  { catSlug: "nutrition", title: "Complete Indian Diet Guide for {topic}" },
  { catSlug: "weight-loss", title: "How to Lose Belly Fat with Indian Home Food: {topic}" },
  { catSlug: "muscle-gain", title: "Hypertrophy & Muscle Building Protocol for {topic}" },
  { catSlug: "protein", title: "Top High Protein Foods for {topic} in India" },
  { catSlug: "recipes", title: "High Protein Quick Recipe for {topic}" },
  { catSlug: "supplements", title: "Scientific Supplement Guide for {topic}" },
  { catSlug: "womens-health", title: "Essential Women's Health Strategy for {topic}" },
  { catSlug: "pcos", title: "PCOS Reversal & Diet Protocols for {topic}" },
  { catSlug: "diabetes", title: "Managing Blood Sugar & HbA1c with {topic}" },
  { catSlug: "heart-health", title: "Cardiovascular Health & Lipid Profile Guide: {topic}" },
  { catSlug: "longevity", title: "Anti-Aging & Cellular Vitality via {topic}" },
  { catSlug: "sleep", title: "Sleep Optimization & Circadian Recovery for {topic}" },
  { catSlug: "stress", title: "Cortisol Reduction & Mindfulness Guide for {topic}" },
  { catSlug: "workplace-fitness", title: "Office Ergonomics & Desk Fitness for {topic}" },
  { catSlug: "home-workouts", title: "No-Equipment Home Workout Protocol for {topic}" },
  { catSlug: "gym", title: "Barbell & Machine Setup Guide for {topic}" },
  { catSlug: "yoga", title: "Pranayama & Asana Flow for {topic}" },
  { catSlug: "running", title: "5k & 10k Endurance Running Strategy for {topic}" },
  { catSlug: "mobility", title: "Hip & Shoulder Mobility Drills for {topic}" },
  { catSlug: "recovery", title: "DOMS Relief & Muscle Recovery Protocols for {topic}" },
  { catSlug: "injuries", title: "Lower Back & Knee Rehab Exercises for {topic}" },
  { catSlug: "creatine", title: "Creatine Monohydrate Loading & Dosage Guide for {topic}" },
  { catSlug: "whey-protein", title: "Whey Concentrate vs Isolate Comparison for {topic}" },
  { catSlug: "vitamins", title: "Vitamin D3 & B12 Deficiency Guide for {topic}" },
  { catSlug: "fat-loss", title: "Caloric Deficit & Metabolism Boost for {topic}" },
  { catSlug: "beginner-guides", title: "Step-by-Step Beginner Fitness Blueprint for {topic}" },
  { catSlug: "senior-fitness", title: "Active Aging & Bone Density Workout for {topic}" },
  { catSlug: "kids-nutrition", title: "Childhood Growth & Healthy Tiffin Hacks for {topic}" },
  { catSlug: "corporate-wellness", title: "Executive Health & Corporate Fitness for {topic}" },
  { catSlug: "pregnancy", title: "Safe Trimester Workout & Prenatal Care for {topic}" },
  { catSlug: "postpartum", title: "Diastasis Recti & Core Rehabilitation for {topic}" },
  { catSlug: "mens-health", title: "Testosterone Boosting & Male Fitness for {topic}" },
  { catSlug: "gut-health", title: "Probiotics & Bloating Cure in Indian Diets for {topic}" },
  { catSlug: "indian-diets", title: "Macro-Balanced South & North Indian Thali Guide for {topic}" },
  { catSlug: "regional-indian-foods", title: "Nutritional Deep-Dive on Dosa, Idli, & Sattu for {topic}" },
  { catSlug: "meal-plans", title: "7-Day Indian Meal Prep Schedule for {topic}" },
  { catSlug: "comparisons", title: "Head to Head Analysis: {topic}" },
  { catSlug: "calculators", title: "How to Use Caloric & Macro Calculators for {topic}" },
  { catSlug: "bangalore-local-guides", title: "At-Home Personal Fitness Coaching in {topic} Bangalore" },
  { catSlug: "nri-fitness", title: "Maintaining Indian Meals & Fitness Abroad for {topic}" },
  { catSlug: "healthy-habits", title: "Habit Stacking & 30-Day Consistency Rule for {topic}" },
  { catSlug: "fitness-science", title: "Decoding Peer-Reviewed Exercise Research for {topic}" },
];

const VARIATIONS = [
  "Busy IT Professionals", "Vegetarians", "Beginners Over 30", "Desk Workers",
  "Post-Workout Recovery", "Fat Burning", "Hormonal Balance", "Metabolic Flexibility",
  "Muscle Retention", "Energy Boost", "Night Shift Workers", "Budget Meal Planning",
];

// ============================================================
// 5. Build the complete mapping
// ============================================================
const fullMap = {}; // old_slug → new_slug
const issues = [];

// Curated
for (const [oldSlug, newSlug] of Object.entries(CURATED_SLUG_MAP)) {
  fullMap[oldSlug] = newSlug;
}

// Researched
for (const [oldSlug, newSlug] of Object.entries(RESEARCHED_SLUG_MAP)) {
  fullMap[oldSlug] = newSlug;
}

// Programmatic
TOPIC_TEMPLATES.forEach((template) => {
  VARIATIONS.forEach((varItem) => {
    const title = template.title.replace("{topic}", varItem);
    const oldSlug = slugify(title);
    const catMap = PROGRAMMATIC_SEO_SLUGS[template.catSlug];
    if (!catMap) {
      issues.push(`Missing category: ${template.catSlug}`);
      return;
    }
    const newSlug = catMap[varItem];
    if (!newSlug) {
      issues.push(`Missing variation: ${template.catSlug} / ${varItem}`);
      return;
    }
    fullMap[oldSlug] = newSlug;
  });
});

// ============================================================
// 6. Collision detection
// ============================================================
const newSlugCounts = {};
for (const [oldSlug, newSlug] of Object.entries(fullMap)) {
  if (!newSlugCounts[newSlug]) newSlugCounts[newSlug] = [];
  newSlugCounts[newSlug].push(oldSlug);
}

const collisions = Object.entries(newSlugCounts).filter(([_, sources]) => sources.length > 1);
if (collisions.length > 0) {
  console.error("SLUG COLLISIONS DETECTED:");
  collisions.forEach(([slug, sources]) => {
    console.error(`  "${slug}" ← ${sources.join(", ")}`);
  });
  process.exit(1);
}

// Check unchanged slugs (old === new)
const unchanged = Object.entries(fullMap).filter(([o, n]) => o === n);
const changed = Object.entries(fullMap).filter(([o, n]) => o !== n);

console.log(`\nSlug mapping complete:`);
console.log(`  Total: ${Object.keys(fullMap).length}`);
console.log(`  Changed: ${changed.length}`);
console.log(`  Unchanged: ${unchanged.length}`);
console.log(`  Collisions: ${collisions.length}`);
if (issues.length) console.log(`  Issues: ${issues.join(", ")}`);

// ============================================================
// 7. Update expanded JSON files
// ============================================================
const expandedFiles = fs.readdirSync(EXPANDED_DIR).filter(f => f.endsWith(".json"));
let keysUpdated = 0;

expandedFiles.forEach(file => {
  const filePath = path.join(EXPANDED_DIR, file);
  const raw = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(raw);
  const newData = {};
  let fileChanged = false;

  Object.entries(data).forEach(([key, value]) => {
    if (fullMap[key] && fullMap[key] !== key) {
      newData[fullMap[key]] = value;
      keysUpdated++;
      fileChanged = true;
    } else {
      newData[key] = value;
    }
  });

  if (fileChanged) {
    fs.writeFileSync(filePath, JSON.stringify(newData, null, 2) + "\n");
  }
});

console.log(`\nExpanded JSON files updated: ${keysUpdated} keys renamed across ${expandedFiles.length} files`);

// ============================================================
// 8. Update researched articles JSON
// ============================================================
const researched = JSON.parse(fs.readFileSync(RESEARCHED_PATH, "utf8"));
let researchedUpdated = 0;

researched.forEach(article => {
  const newSlug = RESEARCHED_SLUG_MAP[article.slug];
  if (newSlug && newSlug !== article.slug) {
    article.slug = newSlug;
    if (article.canonical_url) {
      const routeType = article.recipe_details ? "recipe" : article.comparison_details ? "compare" : "article";
      article.canonical_url = `https://www.getfitved.com/blog/${routeType}/${newSlug}`;
    }
    researchedUpdated++;
  }
});

fs.writeFileSync(RESEARCHED_PATH, JSON.stringify(researched, null, 2) + "\n");
console.log(`Researched articles updated: ${researchedUpdated} slugs changed`);

// ============================================================
// 9. Write redirect map (old_slug → new_slug for all changed)
// ============================================================
const redirectMap = {};
changed.forEach(([oldSlug, newSlug]) => {
  redirectMap[oldSlug] = newSlug;
});

const redirectPath = path.join(ROOT, "src/data/blog/slugRedirects.json");
fs.writeFileSync(redirectPath, JSON.stringify(redirectMap, null, 2) + "\n");
console.log(`\nRedirect map written: ${Object.keys(redirectMap).length} entries → src/data/blog/slugRedirects.json`);

// ============================================================
// 10. Write full mapping for reference
// ============================================================
const mappingPath = path.join(ROOT, "scripts/slug-mapping.json");
fs.writeFileSync(mappingPath, JSON.stringify(fullMap, null, 2) + "\n");
console.log(`Full mapping written: ${Object.keys(fullMap).length} entries → scripts/slug-mapping.json`);
