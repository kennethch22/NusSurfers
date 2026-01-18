import React from 'react';
import { PROJECT_STRUCTURE, REQUIREMENTS_CHECKLIST } from '../constants';
import { FileStructure } from '../types';
import { CheckCircle, Circle, Folder, File, Video, AlertTriangle } from 'lucide-react';

const FileItem: React.FC<{ item: FileStructure; depth: number }> = ({ item, depth }) => {
  return (
    <div className="flex flex-col">
      <div 
        className="flex items-center gap-2 py-1 hover:bg-gray-800 rounded px-2"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        {item.type === 'folder' ? (
          <Folder className="w-4 h-4 text-blue-400" />
        ) : item.name.endsWith('.mp4') ? (
          <Video className="w-4 h-4 text-purple-400" />
        ) : (
          <File className="w-4 h-4 text-gray-400" />
        )}
        <span className={`${item.type === 'folder' ? 'font-semibold text-blue-200' : 'text-gray-300'}`}>
          {item.name}
        </span>
        {item.description && (
          <span className="text-xs text-gray-500 ml-auto italic hidden sm:block">
            {item.description}
          </span>
        )}
      </div>
      {item.children?.map((child, idx) => (
        <FileItem key={idx} item={child} depth={depth + 1} />
      ))}
    </div>
  );
};

export const InstructionGuide: React.FC = () => {
  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-900/50 to-purple-900/50 p-6 rounded-lg border border-blue-800">
        <h2 className="text-2xl font-bold text-white mb-2">Project Setup Guide</h2>
        <p className="text-gray-300">
          Follow these steps to set up your Subway Surfers clone environment.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Step 1: Dependencies */}
        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold">1</div>
            <h3 className="text-xl font-semibold">Install Libraries</h3>
          </div>
          <p className="text-gray-400 mb-4">Open your terminal or command prompt and run:</p>
          <div className="bg-black p-4 rounded border border-gray-700 font-mono text-green-400">
            pip install pygame opencv-python numpy
          </div>
          <div className="mt-4 flex items-start gap-2 bg-yellow-900/20 p-3 rounded border border-yellow-800">
            <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
            <p className="text-sm text-yellow-200">
              We use <code>opencv-python</code> to handle the video background efficiently because Pygame's native movie player is often buggy.
            </p>
          </div>
        </div>

        {/* Step 2: File Structure */}
        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold">2</div>
            <h3 className="text-xl font-semibold">Create Files</h3>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-700 font-mono text-sm h-64 overflow-y-auto custom-scrollbar">
            {PROJECT_STRUCTURE.map((item, idx) => (
              <FileItem key={idx} item={item} depth={0} />
            ))}
          </div>
        </div>
      </div>

      {/* Feature Checklist */}
      <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
        <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
          <CheckCircle className="text-green-500" />
          Implemented Features
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {REQUIREMENTS_CHECKLIST.map((req) => (
            <div key={req.id} className="flex items-start gap-3 p-3 bg-gray-900/50 rounded border border-gray-700">
              {req.completed ? (
                <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
              ) : (
                <Circle className="w-5 h-5 text-gray-600 shrink-0" />
              )}
              <div>
                <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">{req.category}</span>
                <p className="text-sm text-gray-300 leading-tight mt-1">{req.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};