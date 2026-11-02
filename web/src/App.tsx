import { HashRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DataPage } from './pages/DataPage';
import { EstimatePage } from './pages/EstimatePage';
import { LabPage } from './pages/LabPage';

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<EstimatePage />} />
          <Route path="lab" element={<LabPage />} />
          <Route path="data" element={<DataPage />} />
          <Route path="*" element={<EstimatePage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
