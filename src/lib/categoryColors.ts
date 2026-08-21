const categoryColors = [
    'bg-blue-500',
    'bg-gray-500',
    'bg-yellow-500',
    'bg-pink-500',
    'bg-purple-500',
];

const categoryColorMap = new Map<string, string>();
let colorIndex = 0;

export const getCategoryColor = (category: string): string => {
    if (!categoryColorMap.has(category)) {
        categoryColorMap.set(category, categoryColors[colorIndex]);
        colorIndex = (colorIndex + 1) % categoryColors.length;
    }
    return categoryColorMap.get(category)!;
};