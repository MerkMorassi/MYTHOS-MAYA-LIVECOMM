import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Smartphone, Copy, Check, X, Wifi, Radio } from 'lucide-react';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({ isOpen, onClose }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  // Compute the exact iPhone URL with mode=iphone
  const iphoneUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}?mode=iphone`
    : '';

  useEffect(() => {
    if (isOpen && iphoneUrl) {
      QRCode.toDataURL(iphoneUrl, {
        width: 320,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error('Failed to generate QR code', err));
    }
  }, [isOpen, iphoneUrl]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(iphoneUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-slate-900 border border-cyan-500/30 rounded-2xl p-6 shadow-2xl text-slate-100">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-4">
          <div className="p-3 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/30">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Connect iPhone Source</h2>
            <p className="text-xs text-slate-400">Low-latency wireless audio streaming</p>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center p-4 bg-slate-950/60 rounded-xl border border-slate-800 my-4">
          {qrDataUrl ? (
            <div className="p-3 bg-white rounded-xl shadow-lg">
              <img src={qrDataUrl} alt="Scan QR Code with iPhone" className="w-56 h-56 block rounded-lg" />
            </div>
          ) : (
            <div className="w-56 h-56 flex items-center justify-center text-slate-500">
              Generating pairing code...
            </div>
          )}

          <div className="mt-4 flex items-center space-x-2 text-xs text-cyan-300 font-mono">
            <Radio className="w-4 h-4 animate-pulse text-cyan-400" />
            <span>Open iOS Camera & point at code</span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <input
              type="text"
              readOnly
              value={iphoneUrl}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-300 select-all focus:outline-none"
            />
            <button
              onClick={handleCopy}
              className="px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-medium flex items-center space-x-1.5 transition"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          <div className="bg-slate-800/50 rounded-lg p-3 text-xs text-slate-400 space-y-1">
            <div className="flex items-center space-x-1.5 text-slate-300 font-medium">
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              <span>Ensure iPhone is on the same local Wi-Fi</span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-400">
              iPhone will automatically launch in Wireless Mic mode with direct Opus audio streaming to the SONY TV.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
