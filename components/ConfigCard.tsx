import React, { useState, useEffect } from 'react';
import { Copy, Trash2, Shield, ShieldAlert, Globe, Server, Hash, Signal, RefreshCw, Pencil, Check, X, QrCode } from 'lucide-react';
import QRCode from "react-qr-code";
import { ConfigItem, ConfigProtocol, Operator } from '../types';

interface ConfigCardProps {
  item: ConfigItem;
  onDelete: (id: string) => void;
  onCopy: (raw: string) => void;
  onEdit: (id: string, newAlias: string) => void;
  triggerPing: number;
}

const ProtocolBadge = ({ protocol }: { protocol: ConfigProtocol }) => {
  const colors = {
    [ConfigProtocol.VMESS]: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    [ConfigProtocol.VLESS]: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    [ConfigProtocol.TROJAN]: 'bg-green-500/20 text-green-300 border-green-500/30',
    [ConfigProtocol.SHADOWSOCKS]: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
    [ConfigProtocol.WIREGUARD]: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    [ConfigProtocol.TUIC]: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
    [ConfigProtocol.HYSTERIA]: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    [ConfigProtocol.UNKNOWN]: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
  };

  return (
    <span className={`px-2 py-1 rounded-md text-xs font-bold border ${colors[protocol] || colors[ConfigProtocol.UNKNOWN]}`}>
      {protocol}
    </span>
  );
};

const IspBadge = ({ isp }: { isp: Operator }) => {
  const styles = {
    'MCI': { bg: 'bg-orange-500/20', text: 'text-orange-300', border: 'border-orange-500/30', label: 'همراه اول' },
    'Irancell': { bg: 'bg-yellow-400/20', text: 'text-yellow-300', border: 'border-yellow-400/30', label: 'ایرانسل' },
    'TCI': { bg: 'bg-blue-600/20', text: 'text-blue-300', border: 'border-blue-600/30', label: 'مخابرات' },
    'RighTel': { bg: 'bg-pink-600/20', text: 'text-pink-300', border: 'border-pink-600/30', label: 'رایتل' },
    'All': { bg: 'bg-emerald-500/20', text: 'text-emerald-300', border: 'border-emerald-500/30', label: 'همه اپراتورها' },
    'Unknown': { bg: 'bg-slate-700/50', text: 'text-slate-400', border: 'border-slate-600', label: 'نامشخص' },
  };

  const style = styles[isp] || styles['Unknown'];

  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] border ${style.bg} ${style.text} ${style.border}`}>
      {style.label}
    </span>
  );
};

const SecurityIcon = ({ level }: { level: string }) => {
  if (level === 'High') return <Shield className="w-4 h-4 text-emerald-400" />;
  if (level === 'Medium') return <Shield className="w-4 h-4 text-yellow-400" />;
  return <ShieldAlert className="w-4 h-4 text-red-400" />;
};

const ConfigCard: React.FC<ConfigCardProps> = ({ item, onDelete, onCopy, onEdit, triggerPing }) => {
  const [ping, setPing] = useState<number | null | 'Error' | 'Timeout' | 'Blocked'>(item.avgPing);
  const [testing, setTesting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [tempAlias, setTempAlias] = useState(item.alias);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    if (triggerPing > 0) {
      testPing();
    }
  }, [triggerPing]);

  const testPing = async () => {
    if (testing) return;
    setTesting(true);
    setPing(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout
    const startTime = performance.now();

    // Clean address
    const host = item.server.trim();
    const port = String(item.port).trim();
    const rawLower = item.raw.toLowerCase();

    // Determine scheme intelligently
    let scheme = 'http';
    const isTls = 
      item.security === 'High' || 
      port === '443' || 
      port === '8443' ||
      port === '2053' ||
      port === '2083' ||
      port === '2087' ||
      port === '2096' ||
      rawLower.includes('security=tls') || 
      rawLower.includes('security=reality') ||
      rawLower.includes('tls=true') ||
      rawLower.includes('ssl=true');

    if (isTls) {
        scheme = 'https';
    }

    // Add cache buster
    const url = `${scheme}://${host}:${port}/?_=${Date.now()}`;

    try {
      await fetch(url, { 
        mode: 'no-cors', 
        cache: 'no-store',
        signal: controller.signal 
      });
      
      const duration = Math.round(performance.now() - startTime);
      setPing(duration);

    } catch (err: any) {
       const duration = Math.round(performance.now() - startTime);

       if (err.name === 'AbortError') {
           setPing('Timeout');
       } else {
           // Heuristic for "Server is there but rejected protocol"
           // If request failed instantly (< 50ms), it's likely blocked by Browser (Mixed Content/CORS Preflight) or DNS fail.
           // If request took time (> 50ms), it means packets traveled to server and back (TCP RTT), but server sent RST or invalid HTTP.
           // For a VPN user, this means "Online".
           
           if (duration > 50 && duration < 4500) {
                setPing(duration);
           } else {
                // If it was instant failure on HTTPS app -> HTTP config
                if (window.location.protocol === 'https:' && scheme === 'http') {
                    setPing('Blocked'); // Mixed Content
                } else {
                    setPing('Error');
                }
           }
       }
    } finally {
      clearTimeout(timeoutId);
      setTesting(false);
    }
  };

  const getPingColor = (p: number) => {
    if (p < 500) return 'text-emerald-400';
    if (p < 1000) return 'text-yellow-400';
    return 'text-red-400';
  };

  const handleSaveEdit = () => {
    if (tempAlias.trim()) {
      onEdit(item.id, tempAlias.trim());
      setIsEditing(false);
    }
  };

  const handleCancelEdit = () => {
    setTempAlias(item.alias);
    setIsEditing(false);
  };

  return (
    <>
    <div className="group bg-slate-800 rounded-xl p-4 border border-slate-700 hover:border-slate-500 transition-all duration-300 shadow-lg relative overflow-hidden flex flex-col h-full">
        {/* Glow Effect */}
        <div className="absolute top-0 right-0 w-20 h-20 bg-primary/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none transition-opacity opacity-0 group-hover:opacity-100"></div>

        {/* Top Row: Protocol & Location */}
        <div className="flex justify-between items-start mb-3">
            <div className="flex items-center gap-2 flex-wrap">
                <ProtocolBadge protocol={item.protocol} />
                <div className="flex items-center gap-1 text-xs text-slate-400 bg-slate-700/50 px-2 py-1 rounded-full">
                    <Globe size={12} />
                    {item.location}
                </div>
            </div>
            <div className="flex gap-1 shrink-0">
                <button 
                    onClick={() => setShowQr(true)}
                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                    title="نمایش QR"
                >
                    <QrCode size={16} />
                </button>
                 <button 
                    onClick={() => onCopy(item.raw)}
                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                    title="کپی"
                >
                    <Copy size={16} />
                </button>
                <button 
                    onClick={() => onDelete(item.id)}
                    className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                    title="حذف"
                >
                    <Trash2 size={16} />
                </button>
            </div>
        </div>

        {/* Title / Edit Mode */}
        {isEditing ? (
          <div className="flex items-center gap-2 mb-2">
            <input 
              type="text" 
              value={tempAlias}
              onChange={(e) => setTempAlias(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-base text-white outline-none focus:border-primary dir-ltr font-bold"
              autoFocus
              dir="ltr"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveEdit();
                if (e.key === 'Escape') handleCancelEdit();
              }}
            />
            <button onClick={handleSaveEdit} className="text-emerald-400 hover:bg-emerald-400/10 p-1.5 rounded-lg transition-colors"><Check size={16}/></button>
            <button onClick={handleCancelEdit} className="text-red-400 hover:bg-red-400/10 p-1.5 rounded-lg transition-colors"><X size={16}/></button>
          </div>
        ) : (
          <div className="flex items-center gap-2 mb-1 group/title relative pr-7">
            <button 
                onClick={() => {
                  setTempAlias(item.alias);
                  setIsEditing(true);
                }}
                className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-500 hover:text-primary transition-colors p-1 opacity-0 group-hover:opacity-100"
                title="ویرایش نام"
            >
                <Pencil size={14} />
            </button>
            <h4 className="font-bold text-slate-100 truncate text-lg dir-ltr w-full" title={item.alias}>
                {item.alias}
            </h4>
          </div>
        )}
        
        {/* ISP Badge */}
        <div className="mb-4 flex items-center gap-2">
           <IspBadge isp={item.isp} />
        </div>

        {/* Details */}
        <div className="space-y-2 text-sm text-slate-400 mb-4 bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 truncate">
                    <Server size={14} className="text-slate-500 shrink-0" />
                    <span className="truncate font-mono text-xs">{item.server}:{item.port}</span>
                </div>
            </div>
            
            <div className="flex items-center justify-between border-t border-slate-700/50 pt-2">
                 <div className="flex items-center gap-2">
                    <SecurityIcon level={item.security} />
                    <span className="text-xs">امنیت: {item.security === 'High' ? 'بالا' : item.security === 'Medium' ? 'متوسط' : 'پایین'}</span>
                </div>

                {/* Ping Section */}
                <div className="flex items-center gap-2 cursor-pointer select-none" onClick={testPing} title="تست اتصال (TCP RTT)">
                    {testing ? (
                         <RefreshCw size={14} className="animate-spin text-slate-400" />
                    ) : (
                         <Signal size={14} className={typeof ping === 'number' ? getPingColor(ping) : 'text-slate-600'} />
                    )}
                    <span className={`text-xs font-mono font-bold ${typeof ping === 'number' ? getPingColor(ping) : 'text-slate-500'}`}>
                        {testing ? '...' : (
                            ping === 'Error' ? 'Error' : 
                            ping === 'Timeout' ? 'Timeout' :
                            ping === 'Blocked' ? 'Mixed Content' :
                            (ping !== null ? `${ping}ms` : 'Test Ping')
                        )}
                    </span>
                </div>
            </div>
        </div>

        {/* Footer Tags */}
        <div className="flex flex-wrap gap-1 mt-auto">
            {item.tags.map((tag, idx) => (
                <span key={idx} className="flex items-center gap-1 text-[10px] px-2 py-1 bg-slate-900 rounded text-slate-400 border border-slate-800">
                    <Hash size={10} /> {tag}
                </span>
            ))}
        </div>
    </div>

    {/* QR Modal */}
    {showQr && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setShowQr(false)}>
             <div className="bg-white p-6 rounded-3xl shadow-2xl relative max-w-sm w-full transform transition-all scale-100" onClick={e => e.stopPropagation()}>
                <button onClick={() => setShowQr(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors">
                    <X size={24} />
                </button>
                
                <h3 className="text-slate-900 font-bold mb-6 text-center text-lg pr-8 truncate dir-ltr" title={item.alias}>{item.alias}</h3>
                
                <div className="flex justify-center mb-6">
                    <div className="p-2 border-2 border-slate-100 rounded-xl">
                        <QRCode 
                            value={item.raw} 
                            size={256} 
                            style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                            viewBox={`0 0 256 256`}
                        />
                    </div>
                </div>

                <p className="text-center text-slate-500 text-sm mb-4">
                    برای اتصال اسکن کنید
                </p>

                <button 
                    onClick={() => {
                        onCopy(item.raw);
                        setShowQr(false);
                    }}
                    className="w-full py-3 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                >
                    <Copy size={18} />
                    کپی کد کانفیگ
                </button>
             </div>
        </div>
    )}
    </>
  );
};

export default ConfigCard;