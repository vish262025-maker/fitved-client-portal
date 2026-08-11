import React from "react";
import { Link } from "react-router-dom";
import { ARTICLES_DATA } from "@/data/blog/articles";

interface SEOFooterProps {
  bgClass?: string;
}

export function SEOFooter({ bgClass = "bg-slate-900 text-slate-200 border-t border-slate-800/80" }: SEOFooterProps) {
  // Extract 100 real articles for popular article links
  const popularArticles = ARTICLES_DATA.slice(0, 100);

  return (
    <section className={`${bgClass} py-12 px-4 text-xs print:hidden`}>
      <div className="container mx-auto max-w-6xl space-y-12">
        {/* Section Header */}
        <div className="border-b border-slate-800 pb-4">
          <h3 className="text-xl font-bold text-white tracking-tight">Explore Everything</h3>
          <p className="text-xs text-slate-400 mt-1">
            Complete index of fitness guides, Indian diet plans, specialized health topics, recipes, and calculators.
          </p>
        </div>

        {/* Categories & Topics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
          {/* 1. Explore by Goal */}
          <div className="space-y-3">
            <h4 className="font-bold text-orange-400 uppercase tracking-wider text-[11px]">Explore by Goal</h4>
            <ul className="space-y-1.5 text-slate-400">
              <li><Link to="/blog/category/weight-loss" className="hover:text-white transition-colors">Weight Loss</Link></li>
              <li><Link to="/blog/category/muscle-gain" className="hover:text-white transition-colors">Muscle Gain</Link></li>
              <li><Link to="/blog/category/protein" className="hover:text-white transition-colors">Protein</Link></li>
              <li><Link to="/blog/category/fat-loss" className="hover:text-white transition-colors">Fat Loss</Link></li>
              <li><Link to="/blog/category/yoga" className="hover:text-white transition-colors">Yoga</Link></li>
              <li><Link to="/blog/category/mobility" className="hover:text-white transition-colors">Mobility</Link></li>
              <li><Link to="/corporate" className="hover:text-white transition-colors">Corporate Wellness</Link></li>
            </ul>
          </div>

          {/* 2. Explore by Health Condition */}
          <div className="space-y-3">
            <h4 className="font-bold text-orange-400 uppercase tracking-wider text-[11px]">Explore by Health Condition</h4>
            <ul className="space-y-1.5 text-slate-400">
              <li><Link to="/blog/category/pcos" className="hover:text-white transition-colors">PCOS</Link></li>
              <li><Link to="/blog/category/diabetes" className="hover:text-white transition-colors">Diabetes</Link></li>
              <li><Link to="/blog/category/thyroid" className="hover:text-white transition-colors">Thyroid</Link></li>
              <li><Link to="/blog/category/fatty-liver" className="hover:text-white transition-colors">Fatty Liver</Link></li>
              <li><Link to="/blog/category/heart-health" className="hover:text-white transition-colors">Heart Health</Link></li>
              <li><Link to="/blog/category/blood-pressure" className="hover:text-white transition-colors">Blood Pressure</Link></li>
              <li><Link to="/blog/category/gut-health" className="hover:text-white transition-colors">Gut Health</Link></li>
            </ul>
          </div>

          {/* 3. Explore by Categories */}
          <div className="space-y-3">
            <h4 className="font-bold text-orange-400 uppercase tracking-wider text-[11px]">Explore by Categories</h4>
            <ul className="space-y-1.5 text-slate-400">
              <li><Link to="/blog/category/nutrition" className="hover:text-white transition-colors">Nutrition</Link></li>
              <li><Link to="/blog/category/recipes" className="hover:text-white transition-colors">Recipes</Link></li>
              <li><Link to="/blog/category/womens-health" className="hover:text-white transition-colors">Women's Health</Link></li>
              <li><Link to="/blog/category/protein" className="hover:text-white transition-colors">Protein</Link></li>
              <li><Link to="/blog/category/meal-plans" className="hover:text-white transition-colors">Meal Plans</Link></li>
              <li><Link to="/blog/category/fitness" className="hover:text-white transition-colors">Fitness</Link></li>
              <li><Link to="/blog/category/office-wellness" className="hover:text-white transition-colors">Office Wellness</Link></li>
              <li><Link to="/blog/category/supplements" className="hover:text-white transition-colors">Supplements</Link></li>
            </ul>
          </div>

          {/* 4. Explore by Recipes */}
          <div className="space-y-3">
            <h4 className="font-bold text-orange-400 uppercase tracking-wider text-[11px]">Explore by Recipes</h4>
            <ul className="space-y-1.5 text-slate-400">
              <li><Link to="/blog/category/recipes" className="hover:text-white transition-colors">Breakfast</Link></li>
              <li><Link to="/blog/category/recipes" className="hover:text-white transition-colors">Lunch</Link></li>
              <li><Link to="/blog/category/recipes" className="hover:text-white transition-colors">Dinner</Link></li>
              <li><Link to="/blog/category/recipes" className="hover:text-white transition-colors">Snacks</Link></li>
              <li><Link to="/blog/category/recipes" className="hover:text-white transition-colors">High Protein</Link></li>
              <li><Link to="/blog/category/recipes" className="hover:text-white transition-colors">Vegetarian</Link></li>
              <li><Link to="/blog/category/recipes" className="hover:text-white transition-colors">Low Calorie</Link></li>
            </ul>
          </div>

          {/* 5. Topic Hubs */}
          <div className="space-y-3">
            <h4 className="font-bold text-orange-400 uppercase tracking-wider text-[11px]">Topic Hubs</h4>
            <ul className="space-y-1.5 text-slate-400">
              <li><Link to="/blog/topic/high-protein-indian-diet" className="hover:text-white transition-colors">Protein</Link></li>
              <li><Link to="/blog/topic/weight-loss-strategy" className="hover:text-white transition-colors">Weight Loss</Link></li>
              <li><Link to="/blog/topic/pcos-hormone-health" className="hover:text-white transition-colors">PCOS</Link></li>
              <li><Link to="/blog/category/womens-health" className="hover:text-white transition-colors">Women's Health</Link></li>
              <li><Link to="/blog/category/recipes" className="hover:text-white transition-colors">Recipes</Link></li>
              <li><Link to="/blog/category/diabetes" className="hover:text-white transition-colors">Diabetes</Link></li>
              <li><Link to="/corporate" className="hover:text-white transition-colors">Corporate Wellness</Link></li>
              <li><Link to="/blog/category/meal-plans" className="hover:text-white transition-colors">Meal Plans</Link></li>
              <li><Link to="/blog/category/supplements" className="hover:text-white transition-colors">Supplements</Link></li>
              <li><Link to="/blog/category/fitness" className="hover:text-white transition-colors">Fitness</Link></li>
            </ul>
          </div>

          {/* 6. Calculators */}
          <div className="space-y-3">
            <h4 className="font-bold text-orange-400 uppercase tracking-wider text-[11px]">Calculators</h4>
            <ul className="space-y-1.5 text-slate-400">
              <li><Link to="/blog/calculators" className="hover:text-white transition-colors">BMI Calculator</Link></li>
              <li><Link to="/blog/calculators" className="hover:text-white transition-colors">Protein Calculator</Link></li>
              <li><Link to="/blog/calculators" className="hover:text-white transition-colors">Calories Calculator</Link></li>
              <li><Link to="/blog/calculators" className="hover:text-white transition-colors">TDEE Calculator</Link></li>
              <li><Link to="/blog/calculators" className="hover:text-white transition-colors">Macro Calculator</Link></li>
              <li><Link to="/blog/calculators" className="hover:text-white transition-colors">Body Fat Calculator</Link></li>
              <li><Link to="/blog/calculators" className="hover:text-white transition-colors">Ideal Weight Calculator</Link></li>
              <li><Link to="/blog/calculators" className="hover:text-white transition-colors">Water Intake Calculator</Link></li>
            </ul>
          </div>

          {/* 7. Collections & Archives */}
          <div className="space-y-3 sm:col-span-2">
            <h4 className="font-bold text-orange-400 uppercase tracking-wider text-[11px]">Article Collections & Archives</h4>
            <div className="flex flex-wrap gap-2 text-slate-400">
              <Link to="/blog" className="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded hover:text-white transition-colors">Latest Articles</Link>
              <Link to="/blog" className="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded hover:text-white transition-colors">Trending Articles</Link>
              <Link to="/blog" className="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded hover:text-white transition-colors">Featured Articles</Link>
              <Link to="/blog" className="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded hover:text-white transition-colors">Editor's Picks</Link>
              <Link to="/blog" className="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded hover:text-white transition-colors">Recently Updated</Link>
              <Link to="/blog" className="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded hover:text-white transition-colors">Archives</Link>
            </div>
          </div>
        </div>

        {/* 8. Popular Articles (100+ Real Internal Links) */}
        <div className="pt-8 border-t border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-white uppercase tracking-wider text-[11px]">
              Popular Articles ({popularArticles.length}+ Internal Guides)
            </h4>
            <span className="text-[10px] text-slate-500 font-medium">100% Real Pages</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 text-[11px]">
            {popularArticles.map((art) => {
              const url = art.recipe_details
                ? `/blog/recipe/${art.slug}`
                : art.comparison_details
                ? `/blog/compare/${art.slug}`
                : `/blog/article/${art.slug}`;

              return (
                <Link
                  key={art.id}
                  to={url}
                  className="text-slate-400 hover:text-orange-400 transition-colors truncate block py-0.5"
                  title={art.display_title || art.title}
                >
                  • {art.display_title || art.title}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
