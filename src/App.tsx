import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from '@/app/Layout';
import { Home } from '@/pages/Home';
import { AllTools } from '@/pages/AllTools';
import { Settings } from '@/pages/Settings';
import { NotFound } from '@/pages/NotFound';
import { ToolRoute } from '@/pages/ToolRoute';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/tools" element={<AllTools />} />
          <Route path="/tools/:id" element={<ToolRoute />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/404" element={<NotFound />} />
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
