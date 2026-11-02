import { Suspense, lazy } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DataPage } from './pages/DataPage';
import { EstimatePage } from './pages/EstimatePage';

// The Lab carries KaTeX and the stage content, so it loads only when someone opens it.
const LabPage = lazy(() => import('./pages/LabPage').then((m) => ({ default: m.LabPage })));

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<EstimatePage />} />
          <Route
            path="lab"
            element={
              <Suspense
                fallback={
                  <main className="page">
                    <p role="status" className="notice">
                      Loading the Lab…
                    </p>
                  </main>
                }
              >
                <LabPage />
              </Suspense>
            }
          />
          <Route path="data" element={<DataPage />} />
          <Route path="*" element={<EstimatePage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
