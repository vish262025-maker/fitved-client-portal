import React, { useState, useMemo } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import { ARTICLES_DATA } from "@/data/blog/articles";
import slugRedirects from "@/data/blog/slugRedirects.json";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Utensils, Clock, Flame, Dumbbell, Sparkles, ArrowLeft, Printer, CheckCircle2, Share2, Scale,
} from "lucide-react";
import fitvedLogo from "@/assets/fitved-logo.png";
import { BookTrialModal } from "@/components/BookTrialModal";
import {
  generateRecipeSchema, generateBreadcrumbSchema, generateFAQSchema,
  articleUrl, articleKeywords,
} from "@/lib/blog/seo";
import { resolveFeaturedImage, resolveImageAltText } from "@/lib/blog/featuredImageMap";
import { BlogLayout } from "@/components/blog/BlogLayout";
import { BlogSeo } from "@/components/blog/BlogSeo";

export default function RecipeDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [trialModalOpen, setTrialModalOpen] = useState(false);
  const [checkedIngredients, setCheckedIngredients] = useState<Record<number, boolean>>({});

  const redirectTarget = slug ? (slugRedirects as Record<string, string>)[slug] : undefined;
  if (redirectTarget) return <Navigate to={`/blog/recipe/${redirectTarget}`} replace />;

  const article = useMemo(() => {
    const found = ARTICLES_DATA.find((a) => a.slug === slug && a.recipe_details);
    return found ?? ARTICLES_DATA.find((a) => a.recipe_details) ?? null;
  }, [slug]);

  const recipe = article?.recipe_details;

  if (!article || !recipe) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <h2 className="text-xl font-bold text-foreground">Recipe Not Found</h2>
        <Button asChild className="mt-4">
          <Link to="/blog">Back to Journal</Link>
        </Button>
      </div>
    );
  }

  const toggleIngredient = (idx: number) => {
    setCheckedIngredients((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const featuredImage = resolveFeaturedImage(article);
  const breadcrumbs = [
    { name: "Home", url: "/" },
    { name: "FitVed Journal", url: "/blog" },
    { name: article.display_title || article.title, url: `/blog/recipe/${article.slug}` },
  ];
  const recipeSchema = generateRecipeSchema(article, recipe);
  if (recipeSchema) recipeSchema.image = [featuredImage];

  return (
    <BlogLayout breadcrumbs={breadcrumbs}>
      <BlogSeo
        title={article.seo_title || `${article.title} | FitVed`}
        description={article.seo_description || article.summary}
        canonical={articleUrl(article)}
        image={featuredImage}
        keywords={articleKeywords(article)}
        type="article"
        publishedTime={article.published_at}
        modifiedTime={article.updated_at || article.published_at}
        jsonLd={[recipeSchema, generateBreadcrumbSchema(breadcrumbs), generateFAQSchema(article.faq_schema || [])]}
      />

      {/* Hero Header */}
      <section className="bg-slate-900 text-white py-12 px-4">
        <div className="container mx-auto max-w-4xl space-y-4 text-center md:text-left">
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
            <Badge className="bg-orange-500/20 text-orange-400 border-0 px-3 py-1 text-xs">
              High Protein Recipe
            </Badge>
            <Badge variant="outline" className="border-slate-700 text-slate-300 text-xs">
              {recipe.diet_type}
            </Badge>
            <Badge variant="outline" className="border-slate-700 text-slate-300 text-xs">
              Difficulty: {recipe.difficulty}
            </Badge>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white">
            {article.display_title || article.title}
          </h1>

          <p className="text-sm sm:text-base text-slate-300 max-w-2xl">
            {article.summary}
          </p>

          {/* Quick Metrics Bar */}
          <div className="pt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 text-center">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider block">Protein</span>
              <span className="text-xl font-bold text-orange-400">{recipe.protein_g}g</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 text-center">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider block">Calories</span>
              <span className="text-xl font-bold text-white">{recipe.calories} kcal</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 text-center">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider block">Prep & Cook</span>
              <span className="text-xl font-bold text-white">{recipe.prep_time_mins + recipe.cook_time_mins} mins</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 text-center">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider block">Servings</span>
              <span className="text-xl font-bold text-white">{recipe.servings} Person</span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Recipe Content */}
      <main className="container mx-auto max-w-4xl px-4 py-12 flex-1 space-y-10">
        {/* Featured Image */}
        {article.featured_image && (
          <div className="rounded-2xl overflow-hidden border border-border aspect-video shadow-md">
            <img src={featuredImage} alt={resolveImageAltText(article)} loading="lazy" className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=1200&q=80"; }} />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          {/* Ingredients Column */}
          <div className="md:col-span-5 p-6 rounded-2xl border border-border bg-card shadow-sm space-y-4">
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2 border-b border-border pb-3">
              <Utensils className="h-5 w-5 text-orange-500" /> Required Ingredients
            </h3>
            <div className="space-y-2.5">
              {recipe.ingredients.map((ing, idx) => {
                const checked = checkedIngredients[idx];
                return (
                  <label
                    key={idx}
                    onClick={() => toggleIngredient(idx)}
                    className={`flex items-start gap-2.5 text-xs sm:text-sm cursor-pointer p-2 rounded-lg transition-colors ${
                      checked ? "line-through text-muted-foreground bg-muted/40" : "text-foreground font-medium hover:bg-muted/60"
                    }`}
                  >
                    <CheckCircle2 className={`h-4 w-4 shrink-0 mt-0.5 ${checked ? "text-emerald-500" : "text-muted-foreground"}`} />
                    <span>{ing}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Instructions Column */}
          <div className="md:col-span-7 space-y-6">
            <div className="p-6 rounded-2xl border border-border bg-card shadow-sm space-y-4">
              <h3 className="text-lg font-bold text-foreground border-b border-border pb-3">
                Step-by-Step Cooking Instructions
              </h3>
              <ol className="space-y-4">
                {recipe.instructions.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-xs sm:text-sm text-foreground">
                    <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground font-bold text-xs grid place-items-center shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <span className="leading-relaxed mt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Nutrition Breakdown Box */}
            <div className="p-6 rounded-2xl bg-muted/40 border border-border space-y-3">
              <h4 className="text-sm font-bold text-foreground uppercase tracking-wider">Macronutrient Breakdown</h4>
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="p-2 bg-card rounded-lg border border-border">
                  <span className="text-muted-foreground block text-[10px]">Protein</span>
                  <span className="font-bold text-orange-500 text-base">{recipe.protein_g}g</span>
                </div>
                <div className="p-2 bg-card rounded-lg border border-border">
                  <span className="text-muted-foreground block text-[10px]">Carbs</span>
                  <span className="font-bold text-foreground text-base">{recipe.carbs_g}g</span>
                </div>
                <div className="p-2 bg-card rounded-lg border border-border">
                  <span className="text-muted-foreground block text-[10px]">Fats</span>
                  <span className="font-bold text-foreground text-base">{recipe.fat_g}g</span>
                </div>
                <div className="p-2 bg-card rounded-lg border border-border">
                  <span className="text-muted-foreground block text-[10px]">Calories</span>
                  <span className="font-bold text-foreground text-base">{recipe.calories}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <BookTrialModal open={trialModalOpen} onOpenChange={setTrialModalOpen} />
    </BlogLayout>
  );
}
