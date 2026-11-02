import { useEffect } from 'react';

export function LabPage() {
  useEffect(() => {
    document.title = 'Tehran House Price: Model Lab';
  }, []);
  return (
    <main className="page">
      <div>
        <h1>Model Lab</h1>
      </div>
    </main>
  );
}
