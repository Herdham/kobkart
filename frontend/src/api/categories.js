export const CATEGORIES = [
  ['fashion', 'Fashion & Clothing'],
  ['shoes_bags', 'Shoes & Bags'],
  ['kitchen', 'Kitchen & Home'],
  ['electronics', 'Electronics'],
  ['beauty', 'Beauty & Jewellery'],
  ['food', 'Food & Groceries'],
  ['kids', 'Kids & Baby'],
  ['other', 'Other'],
]

export const categoryLabel = (key) => (CATEGORIES.find(([k]) => k === key) || [null, 'Other'])[1]