import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { fetchTerminology, defaultTerminology, type Terminology } from "@/application/queries/terminology.query";

export type { Terminology };

interface TerminologyContextType {
  terms: Terminology;
  setTerms: (terms: Terminology) => void;
  loading: boolean;
  refetch: () => Promise<void>;
}

const TerminologyContext = createContext<TerminologyContextType>({
  terms: defaultTerminology,
  setTerms: () => {},
  loading: true,
  refetch: async () => {},
});

export const useTerminology = () => useContext(TerminologyContext);

export const TerminologyProvider = ({ children }: { children: ReactNode }) => {
  const [terms, setTerms] = useState<Terminology>(defaultTerminology);
  const [loading, setLoading] = useState(true);

  const loadTerminology = async () => {
    try {
      const result = await fetchTerminology();
      setTerms(result);
    } catch (error) {
      // Preferences are non-critical. Keep safe defaults during an outage so
      // they cannot delay or break route rendering.
      console.warn("[TerminologyProvider] using defaults:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(() => loadTerminology());
  }, []);

  return (
    <TerminologyContext.Provider value={{ terms, setTerms, loading, refetch: loadTerminology }}>
      {children}
    </TerminologyContext.Provider>
  );
};
