import React from 'react';
import { GamePreview } from './components/GamePreview';

const App: React.FC = () => {
  return (
    <div className="h-screen w-screen bg-gray-950 overflow-hidden">
        <GamePreview />
    </div>
  );
};

export default App;