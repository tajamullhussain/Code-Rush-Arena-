/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Timer, 
  Heart, 
  Code2, 
  Trophy, 
  Play, 
  RotateCcw, 
  ChevronRight,
  Terminal,
  Cpu,
  Globe,
  Database as DbIcon,
  BrainCircuit,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Undo2,
  Redo2,
  Save,
  Zap
} from 'lucide-react';
import confetti from 'canvas-confetti';
import Editor from 'react-simple-code-editor';
import Prism from './prism-setup';
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

type Language = 'cpp' | 'java' | 'web' | 'python' | 'ml';
type Difficulty = 'easy' | 'medium' | 'hard';

interface Task {
  id: number;
  question: string;
  hints: string;
}

interface LeaderboardEntry {
  username: string;
  score: number;
  language: string;
  difficulty: string;
}

interface PlayerHistoryEntry {
  question: string;
  language: string;
  difficulty: string;
  status: 'attempted' | 'completed';
  report?: PerformanceReport;
  date: string;
}

interface PerformanceReport {
  accuracy: number;
  strengths: string[];
  improvements: string[];
}

const LANGUAGES: { id: Language; name: string; icon: React.ReactNode; color: string }[] = [
  { id: 'cpp', name: 'C++', icon: <Cpu className="w-5 h-5" />, color: 'bg-blue-600' },
  { id: 'java', name: 'Java', icon: <DbIcon className="w-5 h-5" />, color: 'bg-red-600' },
  { id: 'web', name: 'Web (JS)', icon: <Globe className="w-5 h-5" />, color: 'bg-yellow-500' },
  { id: 'python', name: 'Python', icon: <Terminal className="w-5 h-5" />, color: 'bg-sky-500' },
  { id: 'ml', name: 'ML', icon: <BrainCircuit className="w-5 h-5" />, color: 'bg-purple-600' },
];

const DIFFICULTIES: { id: Difficulty; name: string; time: number; color: string }[] = [
  { id: 'easy', name: 'Easy', time: 300, color: 'text-emerald-400 border-emerald-400/30' },
  { id: 'medium', name: 'Medium', time: 210, color: 'text-amber-400 border-amber-400/30' },
  { id: 'hard', name: 'Hard', time: 150, color: 'text-rose-400 border-rose-400/30' },
];

const SNIPPETS: Record<Language, { label: string; code: string }[]> = {
  cpp: [
    { label: 'cout', code: 'std::cout << "" << std::endl;' },
    { label: 'for', code: 'for (int i = 0; i < n; i++) {\n  \n}' },
    { label: 'main', code: 'int main() {\n  \n  return 0;\n}' },
  ],
  java: [
    { label: 'println', code: 'System.out.println("");' },
    { label: 'main', code: 'public static void main(String[] args) {\n  \n}' },
    { label: 'ArrayList', code: 'ArrayList<String> list = new ArrayList<>();' },
  ],
  web: [
    { label: 'log', code: 'console.log("");' },
    { label: 'arrow', code: 'const func = () => {\n  \n};' },
    { label: 'query', code: 'document.querySelector("");' },
  ],
  python: [
    { label: 'print', code: 'print("")' },
    { label: 'for', code: 'for i in range(10):\n    ' },
    { label: 'def', code: 'def function_name():\n    pass' },
  ],
  ml: [
    { label: 'pandas', code: 'import pandas as pd' },
    { label: 'numpy', code: 'import numpy as np' },
    { label: 'zeros', code: 'np.zeros((2, 2))' },
  ],
};

const PRISM_LANG_MAP: Record<Language, string> = {
  cpp: 'cpp',
  java: 'java',
  web: 'javascript',
  python: 'python',
  ml: 'python',
};

export default function App() {
  const [gameState, setGameState] = useState<'start' | 'selection' | 'playing' | 'gameover' | 'victory'>('start');
  const [language, setLanguage] = useState<Language>('web');
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isTimerActive, setIsTimerActive] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [lives, setLives] = useState(3);
  const [score, setScore] = useState(0);
  const [currentTask, setCurrentTask] = useState<Task | null>(null);
  const [code, setCode] = useState('');
  const [history, setHistory] = useState<string[]>(['']);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [playerHistory, setPlayerHistory] = useState<PlayerHistoryEntry[]>([]);
  const [username, setUsername] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [tasksCompleted, setTasksCompleted] = useState(0);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [performanceReport, setPerformanceReport] = useState<PerformanceReport | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [highlightedLines, setHighlightedLines] = useState<number[]>([]);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (gameState === 'playing' && isTimerActive) {
      const limit = DIFFICULTIES.find(d => d.id === difficulty)?.time || 60;
      if (elapsedTime >= limit) {
        endGame('gameover');
      }
    }
  }, [elapsedTime, gameState, isTimerActive, difficulty]);

  const generateTask = async (lang: Language, diff: Difficulty) => {
    setIsGenerating(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Generate a unique and diverse coding challenge for ${lang} at ${diff} difficulty. 
        Avoid repeating common patterns. The challenge should be a concise task that can be solved in 1-5 lines of code.
        Focus on: ${lang === 'web' ? 'DOM manipulation, CSS logic, or JS fundamentals' : lang === 'python' ? 'list comprehensions, dictionary operations, or basic algorithms' : 'syntax, standard library usage, or logic'}.
        Return the response in JSON format with the following fields:
        - question: A clear, professional description of the task.
        - hints: A subtle, helpful hint.
        - starterCode: (Optional) relevant boilerplate code.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              hints: { type: Type.STRING },
              starterCode: { type: Type.STRING },
            },
            required: ["question", "hints"],
          },
        },
      });

      const data = JSON.parse(response.text || '{}');
      const newTask = {
        id: Date.now(),
        question: data.question,
        hints: data.hints,
      };
      setCurrentTask(newTask);
      saveHistory('attempted', newTask);
      setCode(data.starterCode || '');
      setHistory([data.starterCode || '']);
      setHistoryIndex(0);
      setFeedback(null);
      setHighlightedLines([]);
    } catch (err) {
      console.error('Failed to generate task', err);
      // Fallback to a simple task if Gemini fails
      setCurrentTask({
        id: 0,
        question: "Write a function that returns 'Hello World'",
        hints: "Use the standard print or return statement."
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const validateCodeWithGemini = async (userCode: string, task: Task) => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Task: ${task.question}
        User Code:
        \`\`\`${language}
        ${userCode}
        \`\`\`
        Is this code correct for the given task? 
        Consider the logic and syntax for ${language}.
        If correct, identify the line numbers (1-indexed) that specifically address the challenge requirements.
        Return JSON: { "correct": boolean, "feedback": string, "relevantLines": number[] }`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              correct: { type: Type.BOOLEAN },
              feedback: { type: Type.STRING },
              relevantLines: { type: Type.ARRAY, items: { type: Type.NUMBER } },
            },
            required: ["correct", "feedback", "relevantLines"],
          },
        },
      });
      return JSON.parse(response.text || '{"correct": false, "feedback": "Error validating", "relevantLines": []}');
    } catch (err) {
      console.error('Validation failed', err);
      return { correct: false, feedback: "Validation service unavailable", relevantLines: [] };
    }
  };

  const generatePerformanceReport = async (userCode: string, task: Task, isCorrect: boolean, timeTaken: number) => {
    setIsGeneratingReport(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze the user's performance on this coding task.
        Task: ${task.question}
        User Code: ${userCode}
        Correct: ${isCorrect}
        Time Taken: ${timeTaken} seconds
        Difficulty: ${difficulty}
        Language: ${language}
        
        Provide a performance report in JSON:
        {
          "accuracy": number (0-100),
          "strengths": string[],
          "improvements": string[]
        }`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              accuracy: { type: Type.NUMBER },
              strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
              improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["accuracy", "strengths", "improvements"],
          },
        },
      });
      const report = JSON.parse(response.text || '{}');
      setPerformanceReport(report);
    } catch (err) {
      console.error('Failed to generate performance report', err);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
    // Load auto-saved code if exists
    const saved = localStorage.getItem('coderush_autosave');
    if (saved) {
      const { code: savedCode, lang: savedLang } = JSON.parse(saved);
      if (savedLang === language) {
        setCode(savedCode);
        setHistory([savedCode]);
      }
    }
  }, []);

  // Auto-save logic
  useEffect(() => {
    if (gameState === 'playing' && code) {
      const timeout = setTimeout(() => {
        localStorage.setItem('coderush_autosave', JSON.stringify({ code, lang: language }));
        setLastSaved(new Date());
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [code, gameState, language]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (username.trim()) {
        fetchPlayerHistory(username);
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [username]);

  const updateCode = useCallback((newCode: string) => {
    setCode(newCode);
    // Add to history for undo/redo
    if (newCode !== history[historyIndex]) {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newCode);
      // Limit history size
      if (newHistory.length > 50) newHistory.shift();
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
  }, [history, historyIndex]);

  const undo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setCode(history[newIndex]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setCode(history[newIndex]);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') {
          e.preventDefault();
          undo();
        } else if (e.key === 'y') {
          e.preventDefault();
          redo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const insertSnippet = (snippet: string) => {
    updateCode(code + snippet);
  };

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch('/api/leaderboard');
      const data = await res.json();
      setLeaderboard(data);
    } catch (err) {
      console.error('Failed to fetch leaderboard', err);
    }
  };

  const fetchPlayerHistory = async (name: string) => {
    if (!name) return;
    try {
      const res = await fetch(`/api/history/${name}`);
      const data = await res.json();
      setPlayerHistory(data);
    } catch (err) {
      console.error('Failed to fetch player history', err);
    }
  };

  const saveHistory = async (status: 'attempted' | 'completed', taskToSave?: Task, report?: PerformanceReport) => {
    const task = taskToSave || currentTask;
    if (!username || !task) return;
    try {
      await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          taskId: task.id,
          question: task.question,
          language,
          difficulty,
          status,
          report
        }),
      });
      fetchPlayerHistory(username);
    } catch (err) {
      console.error('Failed to save history', err);
    }
  };

  const deleteHistory = async () => {
    if (!username || !window.confirm('Are you sure you want to delete all history?')) return;
    try {
      await fetch(`/api/history/${username}`, {
        method: 'DELETE',
      });
      setPlayerHistory([]);
    } catch (err) {
      console.error('Failed to delete history', err);
    }
  };

  const startGame = () => {
    if (!username.trim()) {
      setFeedback({ type: 'error', message: 'Name required to start mission.' });
      return;
    }
    setElapsedTime(0);
    setLives(3);
    setScore(0);
    setTasksCompleted(0);
    setGameState('playing');
    generateTask(language, difficulty);
    
    // 5 second delay logic
    setCountdown(5);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          setIsTimerActive(true);
          startTimer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);
  };

  const resetGame = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    setGameState('start');
    setElapsedTime(0);
    setIsTimerActive(false);
    setCountdown(0);
    setCurrentTask(null);
    setCode('');
    setFeedback(null);
  };

  const handleSubmit = async () => {
    if (!currentTask || isValidating || isGenerating) return;
    setIsValidating(true);
    try {
      const result = await validateCodeWithGemini(code, currentTask);
      await generatePerformanceReport(code, currentTask, result.correct, elapsedTime);

      if (result.correct) {
        setHighlightedLines(result.relevantLines || []);
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        });
        
        // Scoring system based on correctness and speed (elapsed time)
        const baseScore = difficulty === 'hard' ? 500 : difficulty === 'medium' ? 300 : 100;
        // Faster completion (lower elapsedTime) gives more points
        const speedBonus = Math.max(0, 60 - elapsedTime) * (difficulty === 'hard' ? 10 : difficulty === 'medium' ? 5 : 2);
        const totalPoints = baseScore + speedBonus;
        
        setScore(prev => prev + totalPoints);
        setTasksCompleted(prev => prev + 1);
        saveHistory('completed');
        setFeedback({ type: 'success', message: `Correct! +${totalPoints} points. Analyzing performance...` });
      } else {
        setLives(prev => {
          const newLives = prev - 1;
          if (newLives <= 0) {
            endGame('gameover');
          }
          return newLives;
        });
        setFeedback({ type: 'error', message: result.feedback || 'Incorrect. Try again!' });
      }
    } catch (err) {
      console.error('Validation failed', err);
    } finally {
      setIsValidating(false);
    }
  };

  const endGame = (state: 'gameover' | 'victory') => {
    if (timerRef.current) clearInterval(timerRef.current);
    setGameState(state);
    saveScore();
  };

  const saveScore = async () => {
    try {
      await fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, language, difficulty, score }),
      });
      fetchLeaderboard();
    } catch (err) {
      console.error('Failed to save score', err);
    }
  };


  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 font-sans selection:bg-emerald-500/30">
      <div className="max-w-4xl mx-auto px-6 py-12">
        
        {/* Header */}
        <header className="flex justify-between items-center mb-12">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500 rounded-lg">
              <Code2 className="w-6 h-6 text-black" />
            </div>
            <h1 className="text-2xl font-bold tracking-tighter uppercase italic">Code Rush Arena</h1>
          </div>
          
          {gameState === 'playing' && (
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Timer className="w-5 h-5 text-emerald-400" />
                  <div className="flex flex-col">
                    <span className="font-mono text-2xl font-bold text-emerald-400 leading-none">
                      {Math.floor(elapsedTime / 60)}:{(elapsedTime % 60).toString().padStart(2, '0')}
                    </span>
                    <span className="text-[8px] uppercase tracking-widest text-zinc-600 font-bold">
                      Limit: {Math.floor((DIFFICULTIES.find(d => d.id === difficulty)?.time || 0) / 60)}:{((DIFFICULTIES.find(d => d.id === difficulty)?.time || 0) % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                </div>
                {/* Visual Progress Bar */}
                <div className="w-32 h-1.5 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800 hidden md:block">
                  <motion.div 
                    className="h-full bg-emerald-500"
                    initial={{ width: "0%" }}
                    animate={{ width: `${Math.min(100, (elapsedTime / (DIFFICULTIES.find(d => d.id === difficulty)?.time || 60)) * 100)}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>
              <div className="flex gap-1">
                {[...Array(3)].map((_, i) => (
                  <Heart 
                    key={i} 
                    className={`w-6 h-6 ${i < lives ? 'text-rose-500 fill-rose-500' : 'text-zinc-800'}`} 
                  />
                ))}
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Score</div>
                <div className="text-xl font-mono font-bold text-emerald-400">{score.toLocaleString()}</div>
              </div>
              <button 
                onClick={resetGame}
                className="p-2 hover:bg-zinc-900 rounded-lg transition-colors text-zinc-500 hover:text-rose-500"
                title="Reset Game"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
            </div>
          )}
        </header>

        <main className="relative">
          <AnimatePresence mode="wait">
            
            {/* Start Screen */}
            {gameState === 'start' && (
              <motion.div 
                key="start"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="text-center py-20"
              >
                <h2 className="text-6xl font-black mb-6 tracking-tighter uppercase italic">
                  Code Rush <span className="text-emerald-500">Arena</span>
                </h2>
                <p className="text-zinc-400 text-lg mb-12 max-w-xl mx-auto leading-relaxed">
                  The ultimate test of speed and precision. Choose your language, set your difficulty, and solve as many tasks as you can before the clock runs out.
                </p>
                <button 
                  onClick={() => setGameState('selection')}
                  className="group relative px-12 py-4 bg-zinc-100 text-black font-bold uppercase tracking-widest rounded-full hover:bg-emerald-500 transition-colors duration-300"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    Initialize Game <ChevronRight className="w-5 h-5" />
                  </span>
                </button>
              </motion.div>
            )}

            {/* Selection Screen */}
            {gameState === 'selection' && (
              <motion.div 
                key="selection"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                className="space-y-12"
              >
                <div className="grid md:grid-cols-2 gap-12">
                  <section>
                    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500 mb-6 flex items-center gap-2">
                      <span className="w-8 h-[1px] bg-zinc-800"></span> 01. Select Language
                    </h3>
                    <div className="grid grid-cols-1 gap-3">
                      {LANGUAGES.map((lang) => (
                        <button
                          key={lang.id}
                          onClick={() => setLanguage(lang.id)}
                          className={`flex items-center justify-between p-4 rounded-xl border transition-all duration-200 ${
                            language === lang.id 
                              ? 'bg-zinc-100 text-black border-transparent scale-[1.02]' 
                              : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`p-2 rounded-lg ${language === lang.id ? 'bg-black/10' : lang.color + '/20'}`}>
                              {lang.icon}
                            </div>
                            <span className="font-bold tracking-tight">{lang.name}</span>
                          </div>
                          {language === lang.id && <CheckCircle2 className="w-5 h-5" />}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section>
                    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500 mb-6 flex items-center gap-2">
                      <span className="w-8 h-[1px] bg-zinc-800"></span> 02. Difficulty Level
                    </h3>
                    <div className="grid grid-cols-1 gap-3">
                      {DIFFICULTIES.map((diff) => (
                        <button
                          key={diff.id}
                          onClick={() => setDifficulty(diff.id)}
                          className={`flex items-center justify-between p-4 rounded-xl border transition-all duration-200 ${
                            difficulty === diff.id 
                              ? 'bg-zinc-100 text-black border-transparent scale-[1.02]' 
                              : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                          }`}
                        >
                          <div className="flex flex-col items-start">
                            <span className="font-bold tracking-tight">{diff.name}</span>
                            <span className="text-[10px] uppercase opacity-60">{diff.time} seconds limit</span>
                          </div>
                          {difficulty === diff.id && <CheckCircle2 className="w-5 h-5" />}
                        </button>
                      ))}
                    </div>

                    <div className="mt-12 p-6 bg-zinc-900/30 border border-zinc-800 rounded-2xl">
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Pilot Name</label>
                      <input 
                        type="text" 
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full bg-transparent border-b border-zinc-800 py-2 focus:outline-none focus:border-emerald-500 transition-colors font-mono text-xl"
                        placeholder="Enter username..."
                      />
                    </div>

                    {playerHistory.length > 0 && (
                      <div className="mt-8">
                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-4 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <RotateCcw className="w-3 h-3" /> Mission History
                          </div>
                          <button 
                            onClick={deleteHistory}
                            className="text-[8px] text-rose-500 hover:text-rose-400 font-bold uppercase tracking-widest transition-colors"
                          >
                            Delete All
                          </button>
                        </h3>
                        <div className="space-y-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                          {playerHistory.map((entry, i) => (
                            <div key={i} className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl flex items-center justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-zinc-200 truncate">{entry.question}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-[8px] uppercase font-bold px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-500">{entry.language}</span>
                                  <span className="text-[8px] uppercase font-bold px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-500">{entry.difficulty}</span>
                                  <span className="text-[8px] text-zinc-600 font-mono">{new Date(entry.date).toLocaleDateString()}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {entry.report && (
                                  <button 
                                    onClick={() => setPerformanceReport(entry.report!)}
                                    className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-emerald-400 transition-colors"
                                    title="View Report"
                                  >
                                    <BrainCircuit className="w-3 h-3" />
                                  </button>
                                )}
                                <div className={`px-2 py-1 rounded text-[8px] font-bold uppercase tracking-widest ${
                                  entry.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                }`}>
                                  {entry.status}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </section>
                </div>

                <div className="flex justify-center pt-8">
                  <button 
                    onClick={startGame}
                    disabled={!username.trim()}
                    className={`flex items-center gap-3 px-16 py-5 bg-emerald-500 text-black font-black uppercase tracking-[0.2em] rounded-full hover:bg-emerald-400 transition-all shadow-[0_0_40px_rgba(16,185,129,0.2)] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none`}
                  >
                    <Play className="w-6 h-6 fill-black" /> Launch Session
                  </button>
                </div>
              </motion.div>
            )}

            {/* Playing Screen */}
            {gameState === 'playing' && (
              <motion.div 
                key="playing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid gap-6"
              >
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8 relative overflow-hidden">
                  {isGenerating && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-10">
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-xs font-bold uppercase tracking-widest text-emerald-500">Generating Challenge...</span>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 text-emerald-400">
                      <Terminal className="w-4 h-4" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">Active Challenge</span>
                    </div>
                    <div className="px-3 py-1 bg-zinc-800 rounded-full text-[10px] font-bold uppercase tracking-widest text-zinc-400 border border-zinc-700">
                      Task {tasksCompleted + 1} / 5
                    </div>
                  </div>
                  {currentTask ? (
                    <>
                      <h2 className="text-2xl font-bold mb-4 leading-tight">{currentTask.question}</h2>
                      <div className="flex items-start gap-3 p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
                        <BrainCircuit className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 block mb-1">AI Hint</span>
                          <p className="text-zinc-400 text-sm italic leading-relaxed">{currentTask.hints}</p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="h-24 flex items-center justify-center text-zinc-600 italic">Waiting for challenge...</div>
                  )}
                  
                  {countdown > 0 && (
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-20">
                      <div className="text-center">
                        <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-emerald-500 mb-4">System Initializing</div>
                        <div className="text-8xl font-black italic tracking-tighter text-white animate-pulse">
                          {countdown}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="relative group">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500/20 to-blue-500/20 rounded-2xl blur opacity-30 group-hover:opacity-100 transition duration-1000"></div>
                  <div className="relative bg-black border border-zinc-800 rounded-2xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/80 border-b border-zinc-800">
                      <div className="flex items-center gap-4">
                        <div className="flex gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full bg-rose-500/50"></div>
                          <div className="w-2.5 h-2.5 rounded-full bg-amber-500/50"></div>
                          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/50"></div>
                        </div>
                        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{language} editor</span>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        {lastSaved && (
                          <div className="flex items-center gap-1 text-[10px] text-zinc-600 uppercase font-bold">
                            <Save className="w-3 h-3" />
                            Saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </div>
                        )}
                        <div className="h-4 w-[1px] bg-zinc-800"></div>
                        <div className="flex items-center gap-1">
                          <button 
                            onClick={undo} 
                            disabled={historyIndex === 0}
                            className="p-1 hover:bg-zinc-800 rounded transition-colors disabled:opacity-30"
                            title="Undo (Ctrl+Z)"
                          >
                            <Undo2 className="w-4 h-4 text-zinc-400" />
                          </button>
                          <button 
                            onClick={redo} 
                            disabled={historyIndex === history.length - 1}
                            className="p-1 hover:bg-zinc-800 rounded transition-colors disabled:opacity-30"
                            title="Redo (Ctrl+Y)"
                          >
                            <Redo2 className="w-4 h-4 text-zinc-400" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="code-editor-container">
                      <div className="line-numbers">
                        {code.split('\n').map((_, i) => (
                          <div key={i}>{i + 1}</div>
                        ))}
                      </div>
                      <div className="flex-1 relative">
                        <Editor
                          value={code}
                          onValueChange={updateCode}
                          highlight={code => {
                            const prismLang = PRISM_LANG_MAP[language];
                            let highlighted = code;
                            if (Prism.languages[prismLang]) {
                              highlighted = Prism.highlight(code, Prism.languages[prismLang], prismLang);
                            }
                            
                            if (highlightedLines.length > 0) {
                              const lines = highlighted.split('\n');
                              return lines.map((line, i) => {
                                if (highlightedLines.includes(i + 1)) {
                                  return `<span class="highlighted-line">${line}</span>`;
                                }
                                return line;
                              }).join('\n');
                            }
                            return highlighted;
                          }}
                          padding={24}
                          className="font-mono text-lg min-h-[16rem] editor-textarea"
                          style={{
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                          }}
                          textareaClassName="focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Snippets Section */}
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500 mr-2">
                    <Zap className="w-3 h-3 text-amber-400" />
                    Snippets
                  </div>
                  {SNIPPETS[language].map((snippet, i) => (
                    <button
                      key={i}
                      onClick={() => insertSnippet(snippet.code)}
                      className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/50 transition-all"
                    >
                      {snippet.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <AnimatePresence mode="wait">
                        {feedback && (
                          <motion.div 
                            key={feedback.message}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl border font-mono text-xs ${
                              feedback.type === 'success' 
                                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                                : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                            }`}
                          >
                            <span className="opacity-50">[{new Date().toLocaleTimeString([], { hour12: false })}]</span>
                            <span className="flex items-center gap-2">
                              {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                              {feedback.message}
                            </span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    <button 
                      onClick={handleSubmit}
                      disabled={isValidating || isGenerating || isGeneratingReport}
                      className={`group relative flex items-center gap-3 px-10 py-4 bg-zinc-100 text-black font-black uppercase tracking-[0.2em] rounded-2xl hover:bg-emerald-500 transition-all shadow-xl disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <span className="relative z-10 flex items-center gap-2">
                        {isValidating || isGeneratingReport ? (
                          <>
                            <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                            {isValidating ? 'Validating' : 'Analyzing'}
                          </>
                        ) : (
                          <>
                            Submit Code <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                          </>
                        )}
                      </span>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Game Over / Victory Screen */}
            {(gameState === 'gameover' || gameState === 'victory') && (
              <motion.div 
                key="end"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-12"
              >
                <div className="inline-flex p-6 bg-zinc-900/50 border border-zinc-800 rounded-full mb-8">
                  {gameState === 'victory' ? (
                    <Trophy className="w-16 h-16 text-yellow-500" />
                  ) : (
                    <XCircle className="w-16 h-16 text-rose-500" />
                  )}
                </div>
                <h2 className="text-5xl font-black mb-2 tracking-tighter uppercase italic">
                  {gameState === 'victory' ? 'Mission Complete' : 'Session Terminated'}
                </h2>
                <p className="text-zinc-500 mb-12">
                  {gameState === 'victory' ? 'You mastered all challenges!' : 'Better luck next time, programmer.'}
                </p>

                <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto mb-12">
                  <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-2xl">
                    <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">Final Score</div>
                    <div className="text-3xl font-mono font-bold text-emerald-400">{score.toLocaleString()}</div>
                  </div>
                  <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-2xl">
                    <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">Tasks Done</div>
                    <div className="text-3xl font-mono font-bold text-emerald-400">{tasksCompleted}</div>
                  </div>
                </div>

                <div className="flex justify-center gap-4">
                  <button 
                    onClick={() => setGameState('selection')}
                    className="flex items-center gap-2 px-8 py-4 bg-zinc-100 text-black font-bold uppercase tracking-widest rounded-full hover:bg-emerald-500 transition-all"
                  >
                    <RotateCcw className="w-5 h-5" /> Try Again
                  </button>
                </div>

                {/* Leaderboard */}
                <div className="mt-20 max-w-2xl mx-auto">
                  <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500 mb-8 flex items-center justify-center gap-4">
                    <span className="w-12 h-[1px] bg-zinc-800"></span> Global Leaderboard <span className="w-12 h-[1px] bg-zinc-800"></span>
                  </h3>
                  <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-zinc-800 bg-zinc-900/50">
                          <th className="px-6 py-4 text-[10px] uppercase tracking-widest text-zinc-500">Rank</th>
                          <th className="px-6 py-4 text-[10px] uppercase tracking-widest text-zinc-500">Player</th>
                          <th className="px-6 py-4 text-[10px] uppercase tracking-widest text-zinc-500">Lang</th>
                          <th className="px-6 py-4 text-[10px] uppercase tracking-widest text-zinc-500 text-right">Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leaderboard.map((entry, i) => (
                          <tr key={i} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20 transition-colors">
                            <td className="px-6 py-4 font-mono text-zinc-500">#{i + 1}</td>
                            <td className="px-6 py-4 font-bold">{entry.username}</td>
                            <td className="px-6 py-4">
                              <span className="text-[10px] px-2 py-1 bg-zinc-800 rounded uppercase font-bold text-zinc-400">
                                {entry.language}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right font-mono font-bold text-emerald-400">
                              {entry.score.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Performance Report Modal */}
            <AnimatePresence>
              {performanceReport && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-6"
                >
                  <motion.div 
                    initial={{ scale: 0.9, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.9, y: 20 }}
                    className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 max-w-2xl w-full shadow-2xl overflow-hidden relative"
                  >
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                      <BrainCircuit className="w-48 h-48" />
                    </div>
                    
                    <div className="relative z-10">
                      <div className="flex items-center justify-between mb-8">
                        <div>
                          <h3 className="text-3xl font-black italic uppercase tracking-tighter text-white">Mission Report</h3>
                          <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mt-1">AI Performance Analysis</p>
                        </div>
                        <div className="text-right">
                          <div className="text-5xl font-black text-emerald-500 italic leading-none">{performanceReport.accuracy}%</div>
                          <div className="text-[8px] font-bold uppercase tracking-widest text-zinc-600 mt-1">Accuracy Rating</div>
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-8 mb-10">
                        <div>
                          <h4 className="text-emerald-400 text-[10px] font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                            <CheckCircle2 className="w-3 h-3" /> Core Strengths
                          </h4>
                          <ul className="space-y-2">
                            {performanceReport.strengths.map((s, i) => (
                              <li key={i} className="text-sm text-zinc-300 flex items-start gap-2">
                                <span className="text-emerald-500 mt-1.5 w-1 h-1 rounded-full bg-emerald-500 shrink-0"></span>
                                {s}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <h4 className="text-amber-400 text-[10px] font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                            <AlertCircle className="w-3 h-3" /> Optimization Path
                          </h4>
                          <ul className="space-y-2">
                            {performanceReport.improvements.map((imp, i) => (
                              <li key={i} className="text-sm text-zinc-300 flex items-start gap-2">
                                <span className="text-amber-500 mt-1.5 w-1 h-1 rounded-full bg-amber-500 shrink-0"></span>
                                {imp}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      <div className="flex gap-4">
                        {gameState === 'playing' && (
                          <button 
                            onClick={async () => {
                              if (performanceReport) {
                                await saveHistory('completed', undefined, performanceReport);
                                setFeedback({ type: 'success', message: 'Report saved to mission history.' });
                              }
                            }}
                            className="flex-1 py-5 bg-zinc-800 text-zinc-300 font-bold uppercase tracking-[0.2em] rounded-2xl hover:bg-zinc-700 transition-all flex items-center justify-center gap-3 border border-zinc-700"
                          >
                            <Save className="w-5 h-5" /> Save Report
                          </button>
                        )}
                        <button 
                          onClick={() => {
                            setPerformanceReport(null);
                            if (gameState === 'playing') {
                              if (tasksCompleted >= 5) {
                                endGame('victory');
                              } else {
                                generateTask(language, difficulty);
                              }
                            }
                          }}
                          className="flex-[2] py-5 bg-zinc-100 text-black font-black uppercase tracking-[0.2em] rounded-2xl hover:bg-emerald-500 transition-all flex items-center justify-center gap-3"
                        >
                          {gameState === 'playing' ? 'Continue Mission' : 'Close Report'} <ChevronRight className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
