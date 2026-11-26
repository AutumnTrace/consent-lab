import Link from 'next/link';
import { products } from '@/lib/products';

export default function Home() {
  return (
    <>
      <h1>Gear for long walks</h1>
      <p>Small, sturdy things for days outside. Nothing here is for sale: this shop exists to be tested.</p>
      <ul className="grid">
        {products.slice(0, 2).map((p) => (
          <li key={p.slug}>
            <Link href={`/products/${p.slug}`}>{p.name}</Link> <span>{p.price}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
