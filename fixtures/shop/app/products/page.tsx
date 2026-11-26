import Link from 'next/link';
import { StockWidget } from '@/components/stock-widget';
import { collectorOrigin } from '@/lib/env';
import { products } from '@/lib/products';

export default function Products() {
  return (
    <>
      <h1>Products</h1>
      <StockWidget collector={collectorOrigin()} />
      <ul className="grid">
        {products.map((p) => (
          <li key={p.slug}>
            <Link href={`/products/${p.slug}`}>{p.name}</Link> <span>{p.price}</span>
            <p>{p.blurb}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
