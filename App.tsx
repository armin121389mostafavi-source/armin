import React, { useState, useEffect } from 'react';
import { Plus, Search, Wand2, Activity, Settings, AlertTriangle, Filter, Wifi, DownloadCloud } from 'lucide-react';
import { ConfigItem, ConfigProtocol, Operator } from './types';
import { analyzeConfigString } from './services/geminiService';
import Stats from './components/Stats';
import ConfigCard from './components/ConfigCard';

const ISPs: Operator[] = ['MCI', 'Irancell', 'TCI', 'RighTel'];
const PROTOCOLS = Object.values(ConfigProtocol).filter(p => p !== 'Unknown');

const App = () => {
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(''); // New state for specific status
  const [filterText, setFilterText] = useState('');
  const [selectedIsp, setSelectedIsp] = useState<Operator | 'All'>('All');
  const [selectedProtocol, setSelectedProtocol] = useState<ConfigProtocol | 'All'>('All');
  const [apiKeyError, setApiKeyError] = useState(false);

  // Global trigger for ping testing (timestamp changes to trigger effect in children)
  const [pingTrigger, setPingTrigger] = useState<number>(0);

  useEffect(() => {
    if (!process.env.API_KEY) {
      setApiKeyError(true);
    }
  }, []);

  const fetchSubscriptionContent = async (url: string): Promise<string> => {
    // Use a CORS proxy to bypass browser restrictions
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    
    try {
      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error('Network response was not ok');
      let text = await response.text();
      text = text.trim();

      // Check if it's Base64 encoded (common for subscriptions)
      // Heuristic: No spaces, doesn't start with protocol://, usually looks random
      if (!text.includes('://') && !text.includes(' ')) {
          try {
              // Normalize URL-safe Base64
              const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
              text = atob(base64);
          } catch (e) {
              console.warn("Content was not base64 or failed to decode", e);
          }
      }
      return text;
    } catch (error) {
      console.error("Fetch sub failed", error);
      throw error;
    }
  };

  const handleAddConfig = async () => {
    if (!inputText.trim()) return;

    setIsAnalyzing(true);
    setLoadingMessage('در حال پردازش...');

    try {
      let rawData = inputText.trim();
      
      // Check if input is a URL
      const isUrl = /^(http|https):\/\/[^ "]+$/.test(rawData);
      
      if (isUrl) {
          setLoadingMessage('در حال دانلود اشتراک...');
          try {
              rawData = await fetchSubscriptionContent(rawData);
          } catch (e) {
              alert("خطا در دانلود لینک اشتراک. لطفا از صحت لینک اطمینان حاصل کنید.");
              setIsAnalyzing(false);
              setLoadingMessage('');
              return;
          }
      }

      setLoadingMessage('در حال آنالیز هوشمند...');
      const lines = rawData.split(/[\n\s]+/).filter(l => l.trim().length > 10 && l.includes('://'));
      
      if (lines.length === 0) {
          alert("هیچ کانفیگ معتبری در متن یا لینک یافت نشد.");
          setIsAnalyzing(false);
          setLoadingMessage('');
          return;
      }

      for (const line of lines) {
         try {
             const analysis = await analyzeConfigString(line.trim());
             const newItem: ConfigItem = {
               ...analysis,
               id: crypto.randomUUID(),
               raw: line.trim(),
               addedAt: Date.now(),
             };
             setConfigs(prev => [newItem, ...prev]);
         } catch (e) {
             console.error("Skipping invalid config line", e);
         }
      }
      
      setInputText('');
    } catch (error) {
      console.error("Failed to add config", error);
      alert("خطا در پردازش کانفیگ. لطفا دوباره تلاش کنید.");
    } finally {
      setIsAnalyzing(false);
      setLoadingMessage('');
    }
  };

  const handleDelete = (id: string) => {
    setConfigs(prev => prev.filter(c => c.id !== id));
  };

  const updateRawConfigAlias = (raw: string, newAlias: string): string => {
    const trimmed = raw.trim();
    
    // VMess
    if (trimmed.startsWith('vmess://')) {
      try {
        const b64 = trimmed.substring(8);
        const jsonStr = atob(b64);
        const json = JSON.parse(jsonStr);
        json.ps = newAlias;
        return 'vmess://' + btoa(JSON.stringify(json));
      } catch (e) {
        console.warn('Failed to update VMess alias', e);
        return raw;
      }
    }

    // Other protocols (VLESS, Trojan, SS, etc.) - Update URL fragment
    try {
      // Logic: Replace the part after the last '#' or append it
      const hashIndex = trimmed.lastIndexOf('#');
      if (hashIndex !== -1) {
        return trimmed.substring(0, hashIndex) + '#' + encodeURIComponent(newAlias);
      } else {
        return trimmed + '#' + encodeURIComponent(newAlias);
      }
    } catch (e) {
      console.warn('Failed to update config alias', e);
      return raw;
    }
  };

  const handleEditAlias = (id: string, newAlias: string) => {
    setConfigs(prev => prev.map(c => {
      if (c.id === id) {
        const newRaw = updateRawConfigAlias(c.raw, newAlias);
        return { ...c, alias: newAlias, raw: newRaw };
      }
      return c;
    }));
  };

  const handleCopy = (raw: string) => {
    navigator.clipboard.writeText(raw);
    alert('کانفیگ کپی شد!');
  };

  const filteredConfigs = configs.filter(c => {
    const matchesSearch = c.alias.toLowerCase().includes(filterText.toLowerCase()) || 
                          c.protocol.toLowerCase().includes(filterText.toLowerCase()) ||
                          c.tags.some(t => t.toLowerCase().includes(filterText.toLowerCase()));
    const matchesIsp = selectedIsp === 'All' || c.isp === selectedIsp;
    const matchesProtocol = selectedProtocol === 'All' || c.protocol === selectedProtocol;
    
    return matchesSearch && matchesIsp && matchesProtocol;
  });

  return (
    <div className="min-h-screen pb-12">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className="bg-primary/20 p-2 rounded-lg">
                    <Activity className="text-primary w-6 h-6" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-white">مدیریت کانفیگ</h1>
                    <p className="text-xs text-slate-400">تحلیلگر هوشمند V2Ray & Xray</p>
                </div>
            </div>
        </div>
      </header>

      <main className="container mx-auto px-4 mt-8 space-y-8">
        
        {apiKeyError && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-200 p-4 rounded-xl flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 shrink-0" />
            <p>کلید API جمنای یافت نشد. برنامه برای آنالیز هوشمند نیاز به تنظیم process.env.API_KEY دارد.</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Input Section */}
            <div className="lg:col-span-2 space-y-6">
                <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-xl">
                    <h2 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2">
                        <Plus className="w-5 h-5 text-accent" />
                        افزودن کانفیگ جدید
                    </h2>
                    <textarea
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder="کانفیگ (vmess://...) یا لینک اشتراک (https://...) را اینجا وارد کنید"
                        className="w-full h-32 bg-slate-900 text-slate-200 border border-slate-700 rounded-xl p-4 focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none font-mono text-sm transition-all placeholder:text-slate-600"
                        dir="ltr"
                    />
                    <div className="mt-4 flex justify-end">
                        <button
                            onClick={handleAddConfig}
                            disabled={isAnalyzing || !inputText}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium text-sm transition-all
                                ${isAnalyzing 
                                    ? 'bg-slate-700 text-slate-400 cursor-wait' 
                                    : 'bg-primary hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 active:scale-95'
                                }`}
                        >
                            {isAnalyzing ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                                    {loadingMessage || 'در حال آنالیز...'}
                                </>
                            ) : (
                                <>
                                    {inputText.trim().startsWith('http') ? <DownloadCloud size={16} /> : <Wand2 size={16} />}
                                    {inputText.trim().startsWith('http') ? 'دریافت و افزودن' : 'آنالیز و افزودن'}
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Filters & Actions */}
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                                لیست کانفیگ‌ها
                                <span className="text-xs bg-slate-800 px-2 py-1 rounded-full text-slate-400 font-normal">
                                    {filteredConfigs.length}
                                </span>
                        </h2>
                        <div className="flex gap-2 w-full sm:w-auto">
                            <button 
                                onClick={() => setPingTrigger(Date.now())}
                                className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm transition-colors border border-slate-700"
                            >
                                <Wifi size={16} />
                                تست پینگ همه
                            </button>
                            <div className="relative w-full sm:w-64">
                                <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
                                <input 
                                    type="text" 
                                    placeholder="جستجو..." 
                                    value={filterText}
                                    onChange={(e) => setFilterText(e.target.value)}
                                    className="w-full bg-slate-800 text-slate-200 border border-slate-700 rounded-xl py-2 pr-10 pl-4 text-sm focus:ring-2 focus:ring-slate-600 outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Advanced Filters */}
                    <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 flex flex-col md:flex-row gap-4 items-center">
                        <div className="flex items-center gap-2 text-slate-400 text-sm whitespace-nowrap">
                            <Filter size={16} />
                            فیلترها:
                        </div>
                        
                        <div className="flex flex-wrap gap-2 w-full">
                            <select 
                                value={selectedIsp} 
                                onChange={(e) => setSelectedIsp(e.target.value as Operator | 'All')}
                                className="bg-slate-900 border border-slate-700 text-slate-300 text-sm rounded-lg focus:ring-primary focus:border-primary block p-2 outline-none"
                            >
                                <option value="All">همه اپراتورها</option>
                                {ISPs.map(isp => (
                                    <option key={isp} value={isp}>{isp === 'MCI' ? 'همراه اول' : isp === 'Irancell' ? 'ایرانسل' : isp === 'TCI' ? 'مخابرات' : isp === 'RighTel' ? 'رایتل' : isp}</option>
                                ))}
                            </select>

                            <select 
                                value={selectedProtocol} 
                                onChange={(e) => setSelectedProtocol(e.target.value as ConfigProtocol | 'All')}
                                className="bg-slate-900 border border-slate-700 text-slate-300 text-sm rounded-lg focus:ring-primary focus:border-primary block p-2 outline-none"
                            >
                                <option value="All">همه پروتکل‌ها</option>
                                {PROTOCOLS.map(p => (
                                    <option key={p} value={p}>{p}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Config Grid */}
                {filteredConfigs.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredConfigs.map(item => (
                            <ConfigCard 
                                key={item.id} 
                                item={item} 
                                onDelete={handleDelete}
                                onCopy={handleCopy}
                                onEdit={handleEditAlias}
                                triggerPing={pingTrigger}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-12 bg-slate-800/30 rounded-2xl border border-slate-800 border-dashed">
                        <Settings className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                        <p className="text-slate-500">هیچ کانفیگی با این مشخصات یافت نشد.</p>
                    </div>
                )}
            </div>

            {/* Stats Section (Sidebar) */}
            <div className="lg:col-span-1 space-y-6">
                 <Stats items={configs} />
                 
                 <div className="bg-gradient-to-br from-indigo-900/50 to-slate-900 rounded-2xl p-6 border border-indigo-500/20">
                    <h3 className="font-bold text-white mb-2">راهنما</h3>
                    <p className="text-sm text-slate-400 leading-relaxed mb-2">
                        کانفیگ‌های V2Ray یا <strong>لینک اشتراک (Subscription)</strong> خود را در کادر ورودی قرار دهید.
                    </p>
                    <p className="text-sm text-slate-400 leading-relaxed mb-2">
                        برنامه به صورت خودکار لینک‌های اشتراک را شناسایی، دانلود و کدگشایی (Base64) می‌کند.
                    </p>
                    <p className="text-sm text-slate-400 leading-relaxed">
                        <span className="text-accent">تست پینگ:</span> این تست به معنای برقراری ارتباط واقعی (TCP Handshake) با سرور است.
                    </p>
                 </div>
            </div>
        </div>
      </main>
    </div>
  );
};

export default App;