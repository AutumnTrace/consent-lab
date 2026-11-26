export interface Product {
  slug: string;
  name: string;
  price: string;
  blurb: string;
}

// Fictional products for a fictional shop.
export const products: Product[] = [
  { slug: 'trail-flask', name: 'Trail flask, 600 ml', price: '€24', blurb: 'Double-walled steel. Keeps tea hot through a long morning.' },
  { slug: 'wool-beanie', name: 'Merino beanie', price: '€29', blurb: 'Fine-gauge knit that fits under a hood.' },
  { slug: 'map-case', name: 'Waxed map case', price: '€18', blurb: 'Folds flat, keeps an OS map dry.' },
  { slug: 'camp-mug', name: 'Enamel camp mug', price: '€12', blurb: 'Chips like the real thing.' },
];
