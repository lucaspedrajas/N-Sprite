import React, { useState } from 'react';
import { CheckCircle, RotateCcw, MessageSquare } from 'lucide-react';

interface StageControlsProps {
    onConfirm: () => void;
    onRetryFresh: () => void;
    onRetryWithFeedback?: (feedback: string) => void;
    confirmLabel?: string;
    isProcessing?: boolean;
}

export const StageControls: React.FC<StageControlsProps> = ({
    onConfirm,
    onRetryFresh,
    onRetryWithFeedback,
    confirmLabel = "Confirm & Continue",
    isProcessing
}) => {
    const [showFeedback, setShowFeedback] = useState(false);
    const [feedback, setFeedback] = useState('');

    return (
        <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-slate-700">
            <div className="flex items-center gap-3">
                <button
                    onClick={onConfirm}
                    disabled={isProcessing}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                    <CheckCircle className="w-4 h-4" />
                    {confirmLabel}
                </button>
                <button
                    onClick={onRetryFresh}
                    disabled={isProcessing}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                    <RotateCcw className="w-4 h-4" />
                    Retry
                </button>
                {onRetryWithFeedback && (
                    <button
                        onClick={() => setShowFeedback(!showFeedback)}
                        disabled={isProcessing}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                    >
                        <MessageSquare className="w-4 h-4" />
                        With Feedback
                    </button>
                )}
            </div>
            {showFeedback && onRetryWithFeedback && (
                <div className="flex gap-2">
                    <textarea
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        placeholder="Describe what should be improved..."
                        className="flex-1 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 resize-none"
                        rows={2}
                    />
                    <button
                        onClick={() => { onRetryWithFeedback(feedback); setFeedback(''); setShowFeedback(false); }}
                        disabled={isProcessing}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg"
                    >
                        Send
                    </button>
                </div>
            )}
        </div>
    );
};
