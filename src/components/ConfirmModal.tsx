import React from "react";
import { AlertTriangle, CheckCircle, X } from "lucide-react";

interface ConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  details?: { label: string; value: string }[];
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: "indigo" | "emerald" | "rose";
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title = "Confirm Action",
  message,
  details = [],
  confirmLabel = "Yes, Save Entry",
  cancelLabel = "Cancel",
  confirmColor = "indigo",
  onConfirm,
  onCancel
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const colorMap = {
    indigo: "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20",
    emerald: "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20",
    rose: "bg-rose-600 hover:bg-rose-700 shadow-rose-500/20"
  };

  const iconColorMap = {
    indigo: "text-indigo-400",
    emerald: "text-emerald-400",
    rose: "text-rose-400"
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in-up">
      <div className="relative w-full max-w-sm bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl shadow-black/50 animate-scale-in">
        
        {/* Close button */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 text-slate-500 hover:text-white transition p-1 rounded-lg hover:bg-slate-800"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Icon */}
        <div className="flex items-center gap-3 mb-4">
          <div className={`p-2.5 rounded-xl bg-slate-800 border border-slate-700`}>
            <AlertTriangle className={`w-5 h-5 ${iconColorMap[confirmColor]}`} />
          </div>
          <h3 className="text-base font-bold text-white font-sans">{title}</h3>
        </div>

        {/* Message */}
        <p className="text-sm text-slate-300 leading-relaxed mb-4">{message}</p>

        {/* Details preview */}
        {details.length > 0 && (
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 mb-4 space-y-2">
            {details.map((d, i) => (
              <div key={i} className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-mono uppercase tracking-wider">{d.label}</span>
                <span className="text-white font-semibold">{d.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2.5 mt-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white font-semibold text-sm rounded-xl transition duration-150 cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-2.5 ${colorMap[confirmColor]} text-white font-bold text-sm rounded-xl shadow-lg transition duration-150 cursor-pointer flex items-center justify-center gap-1.5`}
          >
            <CheckCircle className="w-4 h-4" />
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
