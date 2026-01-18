import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Send, Bot, User, Loader2, Key } from 'lucide-react';
import { PYGAME_CODE } from '../constants';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

export const GeminiAssistant: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: "Hi! I'm your coding assistant. I have full context of the Pygame code generated for you. Ask me anything about how the classes work, how to modify the speed, or how to add new features!"
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isKeySet, setIsKeySet] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Check if user has already selected a key using the provided window method from instructions
    // Note: The instructions mention `window.aistudio.hasSelectedApiKey()` for Veo, but for general GenAI 
    // we assume the environment variable is injected if running in that specific environment.
    // However, since we are building a generic web app, we can rely on the process.env.API_KEY check logic 
    // that the runtime will provide if valid.
    
    // For this specific turn, we assume the API KEY is available via process.env.API_KEY
    if (process.env.API_KEY) {
        setIsKeySet(true);
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !process.env.API_KEY) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: input
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const systemPrompt = `
        You are an expert Python Game Developer specializing in Pygame.
        You are assisting a beginner who is building a Subway Surfers clone.
        You have access to the current code base they are using:
        
        \`\`\`python
        ${PYGAME_CODE}
        \`\`\`
        
        Answer their questions specifically referencing this code. Keep answers concise, encouraging, and beginner-friendly.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
            { role: 'user', parts: [{ text: systemPrompt + "\n\nUser Question: " + userMsg.text }] }
        ]
      });

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: response.text || "I couldn't generate a response. Please try again."
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: "Sorry, I encountered an error connecting to the AI. Please ensure your API Key is valid."
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeySelection = async () => {
      // Logic to trigger key selection if supported by the environment wrapper
      const win = window as any;
      if (win.aistudio && win.aistudio.openSelectKey) {
          await win.aistudio.openSelectKey();
          // We optimistically assume success as per instructions
          setIsKeySet(true);
      }
  };

  if (!isKeySet && (!process.env.API_KEY)) {
      return (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <Key className="w-16 h-16 text-yellow-500 mb-4" />
              <h2 className="text-2xl font-bold mb-2">API Key Required</h2>
              <p className="text-gray-400 mb-6 max-w-md">
                  To use the AI coding assistant, you need to provide a Google Gemini API Key.
              </p>
              {(window as any).aistudio ? (
                   <button 
                   onClick={handleKeySelection}
                   className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold transition-colors"
                 >
                   Select API Key
                 </button>
              ) : (
                  <div className="bg-red-900/20 border border-red-500 p-4 rounded text-red-200">
                      Environment configuration missing. Cannot prompt for key.
                  </div>
              )}
          </div>
      )
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg overflow-hidden border border-gray-700">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-3 ${
              msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
            }`}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                msg.role === 'user' ? 'bg-blue-600' : 'bg-purple-600'
              }`}
            >
              {msg.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
            </div>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-tr-none'
                  : 'bg-gray-800 text-gray-100 rounded-tl-none border border-gray-700'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.text}</div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex items-start gap-3">
             <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center shrink-0">
                <Bot className="w-5 h-5" />
             </div>
             <div className="bg-gray-800 rounded-2xl rounded-tl-none px-4 py-2 border border-gray-700">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
             </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-gray-800 border-t border-gray-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask about the code (e.g., 'How do I make the game faster?')"
            className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="p-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};