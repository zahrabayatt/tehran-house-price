import { useEffect } from 'react';

export function DataPage() {
  useEffect(() => {
    document.title = 'Tehran House Price: Data';
  }, []);
  return (
    <main className="page">
      <div>
        <h1>Where the numbers come from</h1>
        <p className="lede">
          One million real estate ads released by Divar, narrowed down to apartments for sale in Tehran. These are
          advertised prices, not completed sales.
        </p>
      </div>
    </main>
  );
}
