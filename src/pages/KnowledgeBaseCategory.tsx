import { Link, useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, BookOpen, ChevronRight } from "lucide-react";
import { KNOWLEDGE_BASE_ARTICLES, KNOWLEDGE_BASE_CATEGORIES } from "@/data/knowledgeBase";

const KnowledgeBaseCategory = () => {
  const { categorySlug } = useParams();
  const category = KNOWLEDGE_BASE_CATEGORIES.find((item) => item.slug === categorySlug);

  if (!category) {
    return (
      <AppLayout title="Knowledge Base">
        <div className="text-center py-16">
          <BookOpen className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Category not found</h2>
          <Link to="/knowledge-base" className="text-primary hover:underline text-sm">
            Back to Knowledge Base
          </Link>
        </div>
      </AppLayout>
    );
  }

  const articles = KNOWLEDGE_BASE_ARTICLES.filter((article) => article.category === category.label);
  const Icon = category.icon;

  return (
    <AppLayout title={category.label}>
      <div className="mb-6">
        <Link to="/knowledge-base" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to Knowledge Base
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className={`p-2 rounded-lg ${category.color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-bold">{category.label}</h1>
        <Badge variant="secondary">{articles.length}</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {articles.map((article) => (
          <Card key={article.id} className="hover:shadow-md transition-all hover:border-primary/30">
            <CardContent className="p-5">
              <h2 className="font-semibold mb-1.5">{article.title}</h2>
              <p className="text-sm text-muted-foreground mb-3">{article.description}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{article.readTime}</span>
                <span className="inline-flex items-center gap-1 text-xs text-primary">
                  Learn more
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppLayout>
  );
};

export default KnowledgeBaseCategory;
