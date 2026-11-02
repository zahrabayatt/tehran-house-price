import { useEffect } from 'react';

export function EstimatePage() {
  useEffect(() => {
    document.title = 'Tehran House Price: Estimate';
  }, []);
  return (
    <main className="page">
      <div>
        <h1>What would this Tehran apartment be advertised for?</h1>
        <p className="lede">
          Describe an apartment and get an estimate from a model trained on real Divar listings, with every step of the
          calculation shown.
        </p>
      </div>
    </main>
  );
}
