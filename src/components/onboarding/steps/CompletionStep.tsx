import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PartyPopper, Rocket, ArrowRight, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface CompletionStepProps {
  businessName: string;
}

export const CompletionStep = ({ businessName }: CompletionStepProps) => {
  const navigate = useNavigate();
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    // Hide confetti after a few seconds
    const timer = setTimeout(() => setShowConfetti(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  const handleGoToDashboard = () => {
    navigate("/dashboard");
  };

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="text-center pb-2">
        <div className="mx-auto w-16 h-16 rounded-md bg-gray-100 dark:bg-gray-900/30 flex items-center justify-center mb-4 relative">
          <PartyPopper className="h-8 w-8 text-gray-600" />
          {showConfetti && (
            <div className="absolute inset-0 animate-ping rounded-md bg-green-400/30" />
          )}
        </div>
        <CardTitle className="text-3xl">You're all set! 🎉</CardTitle>
        <CardDescription className="text-lg">
          {businessName} is ready to start accepting bookings
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 max-w-md mx-auto">
        {/* Summary */}
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground text-center">
            Here's what's been set up:
          </p>
          <div className="space-y-2">
            {[
              "Business profile created",
              "Service area configured",
              "Working hours set",
              "Services ready to book",
            ].map((item, index) => (
              <div key={index} className="flex items-center gap-2 text-sm">
                <div className="h-5 w-5 rounded-md bg-gray-100 dark:bg-gray-900/30 flex items-center justify-center">
                  <Check className="h-3 w-3 text-gray-600" />
                </div>
                {item}
              </div>
            ))}
          </div>
        </div>

        {/* Next steps */}
        <div className="bg-muted/50 rounded-lg p-4 space-y-3">
          <p className="font-medium text-sm flex items-center gap-2">
            <Rocket className="h-4 w-4 text-primary" />
            What's next?
          </p>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>Share your booking link with customers</li>
            <li>Add more services to your catalog</li>
            <li>Customize your availability settings</li>
          </ul>
        </div>

        <Button
          onClick={handleGoToDashboard}
          className="w-full"
          size="lg"
        >
          Go to Dashboard
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </CardContent>
    </Card>
  );
};
