import { useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, BookOpen, ChevronRight, ExternalLink } from "lucide-react";
import { KNOWLEDGE_BASE_ARTICLES, KNOWLEDGE_BASE_CATEGORIES } from "@/data/knowledgeBase";

const KnowledgeBase = () => {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filtered = KNOWLEDGE_BASE_ARTICLES.filter((a) => {
    const matchesSearch =
      !search ||
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !activeCategory || a.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const groupedByCategory = KNOWLEDGE_BASE_CATEGORIES.map((cat) => ({
    ...cat,
    articles: filtered.filter((a) => a.category === cat.label),
  })).filter((g) => g.articles.length > 0);

  return (
    <AppLayout title="Knowledge Base">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {KNOWLEDGE_BASE_CATEGORIES.map((category) => {
          const Icon = category.icon;
          const count = KNOWLEDGE_BASE_ARTICLES.filter((article) => article.category === category.label).length;

          return (
            <Link to={`/knowledge-base/${category.slug}`} key={category.slug}>
              <Card className="h-full hover:shadow-md transition-all hover:border-primary/30">
                <CardContent className="p-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={`p-1.5 rounded-md ${category.color}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <h2 className="font-semibold text-sm">{category.label}</h2>
                    </div>
                    <p className="text-xs text-muted-foreground">{count} articles</p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="max-w-2xl mx-auto mb-8">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Search articles..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-11 h-12 text-base"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-8">
        <button
          onClick={() => setActiveCategory(null)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            !activeCategory
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          All
        </button>
        {KNOWLEDGE_BASE_CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          return (
            <button
              key={cat.label}
              onClick={() => setActiveCategory(activeCategory === cat.label ? null : cat.label)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeCategory === cat.label
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {cat.label}
            </button>
          );
        })}
      </div>

      {groupedByCategory.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-1">No articles found</h3>
          <p className="text-muted-foreground">Try a different search term or category.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {groupedByCategory.map((group) => {
            const Icon = group.icon;
            return (
              <div key={group.label}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`p-1.5 rounded-lg ${group.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <h2 className="text-lg font-semibold">{group.label}</h2>
                  <Badge variant="secondary" className="text-xs">{group.articles.length}</Badge>
                  <Link to={`/knowledge-base/${group.slug}`} className="ml-auto text-xs text-primary hover:underline">
                    Open page
                  </Link>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {group.articles.map((article) => (
                    <Link to={`/knowledge-base/${group.slug}`} key={article.id}>
                      <Card className="group cursor-pointer hover:shadow-md transition-all hover:border-primary/30">
                        <CardContent className="flex items-center gap-3 p-4">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-sm group-hover:text-primary transition-colors">
                              {article.title}
                            </h3>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                              {article.description}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] text-muted-foreground">{article.readTime}</span>
                            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
};

export default KnowledgeBase;
