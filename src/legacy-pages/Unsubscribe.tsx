import { apiClient, ApiClientError } from "@/lib/api-client";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  const [message, setMessage] = useState<string>("Updating your preferences…");

  useEffect(() => {
    if (!token) {
      void Promise.resolve().then(() => setState("error"));
      void Promise.resolve().then(() => setMessage("This unsubscribe link is missing its token."));
      return;
    }
    (async () => {
      try {
        await apiClient.post("/v1/newsletter/unsubscribe", { token });
        setState("done");
        setMessage("You're unsubscribed. You'll no longer receive our newsletter.");
      } catch (error) {
        setState("error");
        setMessage(
          error instanceof ApiClientError
            ? "That unsubscribe link isn't valid or has already been used."
            : "Something went wrong. Please try again later.",
        );
      }
    })();
  }, [token]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-6">
      <section className="max-w-md w-full text-center space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Newsletter preferences</h1>
        <p className="text-muted-foreground">{message}</p>
        {state === "loading" && <div className="text-sm text-muted-foreground">One moment…</div>}
        <a href="/" className="inline-block text-sm underline text-foreground/80 hover:text-foreground">
          Return home
        </a>
      </section>
    </main>
  );
}
