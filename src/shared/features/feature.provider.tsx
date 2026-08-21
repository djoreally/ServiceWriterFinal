import { createContext, useContext } from 'react';
import { features } from '@/config/features';

type FeatureContextType = typeof features;

const FeatureContext = createContext<FeatureContextType>(features);

export const FeatureProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <FeatureContext.Provider value={features}>{children}</FeatureContext.Provider>
  );
};

export const useFeatures = () => {
  const context = useContext(FeatureContext);
  if (context === undefined) {
    throw new Error('useFeatures must be used within a FeatureProvider');
  }
  return context;
};