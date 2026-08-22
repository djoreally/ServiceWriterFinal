import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

const SupportPage = () => {
  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center mb-4">
        <Button asChild variant="outline" size="icon" className="mr-4">
          <Link to="/dashboard">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Get Support</h1>
      </div>
      <p className="mb-2">Live support chat is not configured for this app right now.</p>
      <p className="text-sm text-muted-foreground">
        This page intentionally does not load a placeholder support widget.
      </p>
    </div>
  );
};

export default SupportPage;
