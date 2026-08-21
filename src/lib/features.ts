import { features } from '@/config/features';

// This is an example of how to use the feature flag system.
// You can add your own feature flags in src/config/features.ts
// and then use them in your code like this:
//
// import { useFeatures } from '@/shared/features/feature.provider';
//
// const { 'new-feature': newFeature } = useFeatures();
//
// if (newFeature) {
//   // Do something
// }

export const useExampleFeature = () => {
  const { 'example-feature': exampleFeature } = features;
  return exampleFeature;
};
