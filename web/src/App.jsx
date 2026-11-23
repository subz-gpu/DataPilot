import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell, RequireAuth } from './components/Layout.jsx';
import LoginPage from './pages/Login.jsx';
import AnalysesPage from './pages/Analyses.jsx';
import DatasetsPage from './pages/Datasets.jsx';
import NewAnalysisPage from './pages/NewAnalysis.jsx';
import RunPage from './pages/Run.jsx';
import ProfilePage from './pages/Profile.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<AnalysesPage />} />
          <Route path="datasets" element={<DatasetsPage />} />
          <Route path="new" element={<NewAnalysisPage />} />
          <Route path="runs/:id" element={<RunPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
