import { Routes, Route } from 'react-router-dom';
import { BoardsLanding } from './pages/BoardsLanding';
import { NewBoardSetup } from './pages/NewBoardSetup';
import { BoardWorkspace } from './pages/BoardWorkspace';
import { ProfilePage } from './pages/ProfilePage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<BoardsLanding />} />
      <Route path="/new" element={<NewBoardSetup />} />
      <Route path="/b/:id" element={<BoardWorkspace />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="*" element={<BoardsLanding />} />
    </Routes>
  );
}
