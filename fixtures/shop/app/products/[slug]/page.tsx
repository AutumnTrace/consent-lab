import { notFound } from 'next/navigation';
import { products } from '@/lib/products';

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = products.find((p) => p.slug === slug);
  if (!product) notFound();
  return (
    <>
      <h1>{product.name}</h1>
      <p className="price">{product.price}</p>
      <p>{product.blurb}</p>
    </>
  );
}
