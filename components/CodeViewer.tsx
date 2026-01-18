import React, { useState } from 'react';
import { PYGAME_CODE } from '../constants';
import { Copy, Check, Download } from 'lucide-react';

export const CodeViewer: React.FC = () => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(PYGAME_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const element = document.createElement("a");
    const file = new Blob([PYGAME_CODE], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = "main.py";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between bg-gray-800 p-4 border-b border-gray-700 rounded-t-lg">
        <div className="flex items-center gap-4">
          <h2 className="font-mono text-lg font-bold text-green-400">main.py</h2>
          <span className="text-xs text-gray-500 bg-gray-900 px-2 py-1 rounded">Python 3.8+</span>
        </div>
        <div className="flex items-center gap-3">
            <button 
            onClick={handleDownload}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
          >
            <Download className="w-4 h-4" />
            Download
          </button>
          <button 
            onClick={handleCopy}
            className={`flex items-center gap-2 px-4 py-1.5 rounded text-sm font-medium transition-colors ${
              copied 
                ? 'bg-green-600 text-white' 
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy Code'}
          </button>
        </div>
      </div>

      {/* Code Area */}
      <div className="flex-1 bg-gray-950 overflow-auto relative rounded-b-lg border border-gray-700 custom-scrollbar">
        <pre className="p-4 font-mono text-sm text-gray-300 leading-6">
          {PYGAME_CODE.split('\n').map((line, i) => (
            <div key={i} className="table-row">
              <span className="table-cell text-right select-none text-gray-700 pr-4 w-10 border-r border-gray-800 mr-4">
                {i + 1}
              </span>
              <span className="table-cell pl-4 whitespace-pre-wrap">{line}</span>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
};