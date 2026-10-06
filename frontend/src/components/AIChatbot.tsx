import React, { useState, useRef, useEffect } from 'react';
import { 
  Bot, 
  Send, 
  User, 
  Sparkles, 
  AlertCircle, 
  FileText, 
  ExternalLink, 
  ShieldCheck, 
  Loader2,
  RefreshCw,
  Info,
  ArrowLeft,
  MoreVertical,
  X,
  ChevronRight
} from 'lucide-react';
import { ApiService } from '../services/api';
import { AIChatMessage, AICitation } from '../types';
import { useKeyboard } from '../utils/useKeyboard';

interface AIChatbotProps {
  actorType: 'patient' | 'doctor';
  onOpenRecord?: (recordId: string) => void;
  onViewRecordDetail?: (citation: AICitation) => void;
  suggestedPrompts?: string[];
  onBack?: () => void;
  onGenerateSummary?: () => void;
}

export const AIChatbot: React.FC<AIChatbotProps> = ({
  actorType,
  onOpenRecord,
  onViewRecordDetail,
  suggestedPrompts,
  onBack,
  onGenerateSummary
}) => {
  const [messages, setMessages] = useState<AIChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      message: actorType === 'patient'
        ? `Hello, I'm **MediBrief AI**, your personal health records assistant.\n\nI analyze your verified medical records to explain lab metrics, medication regimens, and health trends.\n\n### How I can help:\n• Explain lab test results and reference ranges\n• Track metric changes across multiple dates\n• Review active prescriptions and dosages\n\n*What would you like to understand about your records?*`
        : `Welcome Doctor. I am **MediBrief Clinical Assistant**.\n\nI am strictly constrained to the records shared in this temporary consultation session.\n\n### Clinical inquiries:\n• Active diagnoses and past medical history\n• Active prescription regimens and dosages\n• Recent laboratory investigations and flagged abnormalities`,
      disclaimer: 'MediBrief AI aids record comprehension and does not replace medical advice.',
      created_at: new Date().toISOString()
    }
  ]);

  const [input, setInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastFailedQuery, setLastFailedQuery] = useState<string | null>(null);
  const [showDisclaimer, setShowDisclaimer] = useState<boolean>(true);
  const [headerMenuOpen, setHeaderMenuOpen] = useState<boolean>(false);

  const { isKeyboardOpen, keyboardHeight } = useKeyboard();

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const mobileInputRef = useRef<HTMLInputElement | null>(null);

  const defaultPrompts = actorType === 'patient' ? [
    'What changed in my recent reports?',
    'What medications am I taking?',
    'Show my blood test trends',
    'Summarize my medical history'
  ] : [
    'What medications is this patient taking?',
    'What are the active diagnoses?',
    'Latest HbA1c and glycemic trend',
    'Are there any abnormal lab findings?'
  ];

  const prompts = suggestedPrompts || defaultPrompts;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  useEffect(() => {
    if (isKeyboardOpen) {
      setTimeout(() => {
        scrollToBottom();
      }, 150);
    }
  }, [isKeyboardOpen]);

  const handleSend = async (queryText?: string) => {
    const text = queryText || input;
    if (!text.trim() || isLoading) return;

    const userMessage: AIChatMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      message: text.trim(),
      created_at: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setLastFailedQuery(null);

    const historyPayload = messages.slice(-4).map(m => ({
      role: m.role,
      message: m.message
    }));

    try {
      const response = actorType === 'patient'
        ? await ApiService.askPatientAI(text.trim(), historyPayload)
        : await ApiService.askDoctorAI(text.trim(), historyPayload);

      const assistantMessage: AIChatMessage = {
        id: `ai_${Date.now()}`,
        role: 'assistant',
        message: response.answer,
        citations: response.citations,
        disclaimer: response.disclaimer || 'MediBrief AI aids record comprehension and does not replace medical advice.',
        created_at: new Date().toISOString()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err: any) {
      setLastFailedQuery(text.trim());
      setMessages(prev => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'assistant',
          message: `I couldn't retrieve the relevant records right now. ${err.message || 'Please try again.'}`,
          created_at: new Date().toISOString()
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestartChat = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        message: actorType === 'patient'
          ? `Hello, I'm **MediBrief AI**, your personal health records assistant. Ask me anything about your reports, prescriptions, or lab trends.`
          : `Welcome Doctor. I am **MediBrief Clinical Assistant**, scoped strictly to the records shared in this consultation session.`,
        disclaimer: 'MediBrief AI aids record comprehension and does not replace medical advice.',
        created_at: new Date().toISOString()
      }
    ]);
  };

  // Medical metric highlighter helper
  const highlightMedicalValues = (rawText: string) => {
    const metricRegex = /(\b\d+(?:[\.,]\d+)?(?:\/\d+)?\s*(?:gm%|g\/dL|mg\/dL|µg\/dL|ug\/dL|mmol\/L|mEq\/L|IU\/L|U\/L|\/cmm|\/cumm|cells\/mcL|\/µL|fl|fL|pg|mmHg|bpm|%)\b)/gi;
    const parts = rawText.split(metricRegex);
    if (parts.length === 1) return rawText;

    return parts.map((part, pIdx) => {
      if (metricRegex.test(part)) {
        return (
          <span
            key={pIdx}
            className="font-bold text-teal-950 bg-teal-50 px-1.5 py-0.5 rounded-md border border-teal-200/80 inline-block text-[13px] sm:text-[14px] mx-0.5 shadow-2xs"
          >
            {part}
          </span>
        );
      }
      return part;
    });
  };

  // Inline markdown formatter (bold, italic, medical metrics)
  const renderInline = (text: string) => {
    const tokens = text.split(/(\*\*.*?\*\*|\*.*?\*)/g);

    return tokens.map((token, tIdx) => {
      if (token.startsWith('**') && token.endsWith('**') && token.length >= 4) {
        const boldContent = token.slice(2, -2);
        return (
          <strong key={tIdx} className="font-extrabold text-slate-900">
            {highlightMedicalValues(boldContent)}
          </strong>
        );
      }
      if (token.startsWith('*') && token.endsWith('*') && token.length >= 2) {
        const italicContent = token.slice(1, -1);
        return (
          <em key={tIdx} className="italic text-slate-700">
            {highlightMedicalValues(italicContent)}
          </em>
        );
      }
      return <React.Fragment key={tIdx}>{highlightMedicalValues(token)}</React.Fragment>;
    });
  };

  // Structured clinical markdown message renderer
  const renderFormattedMessage = (content: string) => {
    if (!content) return null;
    const blocks = content.split(/\n\n+/);

    return blocks.map((block, bIdx) => {
      const lines = block.split('\n').map(l => l.trim()).filter(Boolean);

      // 1. Full Bullet list block
      const isBulletList = lines.length > 0 && lines.every(l => /^[-*•]\s+/.test(l));
      if (isBulletList) {
        return (
          <div key={bIdx} className="space-y-2 my-2.5 pl-0.5">
            {lines.map((line, lIdx) => {
              const cleanText = line.replace(/^[-*•]\s+/, '');
              return (
                <div key={lIdx} className="flex items-start space-x-2.5 text-[15px] sm:text-base leading-relaxed text-slate-800">
                  <span className="text-teal-600 font-bold text-base leading-none mt-1 shrink-0">•</span>
                  <div className="flex-1 min-w-0">{renderInline(cleanText)}</div>
                </div>
              );
            })}
          </div>
        );
      }

      // 2. Numbered list block
      const isNumberedList = lines.length > 0 && lines.every(l => /^\d+[\.\)]\s+/.test(l));
      if (isNumberedList) {
        return (
          <div key={bIdx} className="space-y-2 my-2.5 pl-0.5">
            {lines.map((line, lIdx) => {
              const match = line.match(/^(\d+)[\.\)]\s+(.*)/);
              const num = match ? match[1] : `${lIdx + 1}`;
              const cleanText = match ? match[2] : line;
              return (
                <div key={lIdx} className="flex items-start space-x-2.5 text-[15px] sm:text-base leading-relaxed text-slate-800">
                  <span className="text-teal-800 font-bold text-[11px] bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded-md mt-0.5 shrink-0">
                    {num}
                  </span>
                  <div className="flex-1 min-w-0">{renderInline(cleanText)}</div>
                </div>
              );
            })}
          </div>
        );
      }

      // 3. Regular block / mixed headings & paragraphs
      return (
        <div key={bIdx} className="space-y-2 mb-3 last:mb-0">
          {lines.map((line, lIdx) => {
            // Heading 3 or 2
            if (/^###?\s+/.test(line)) {
              const heading = line.replace(/^###?\s+/, '');
              return (
                <h4 key={lIdx} className="text-sm sm:text-base font-extrabold text-slate-900 mt-3 mb-1.5 flex items-center space-x-2">
                  <span className="w-1.5 h-3.5 bg-teal-600 rounded-full inline-block shrink-0" />
                  <span>{heading}</span>
                </h4>
              );
            }
            // Heading 1
            if (/^#\s+/.test(line)) {
              const heading = line.replace(/^#\s+/, '');
              return (
                <h3 key={lIdx} className="text-base sm:text-lg font-black text-slate-900 mt-3.5 mb-1.5">
                  {heading}
                </h3>
              );
            }
            // Single bullet line in mixed block
            if (/^[-*•]\s+/.test(line)) {
              const cleanText = line.replace(/^[-*•]\s+/, '');
              return (
                <div key={lIdx} className="flex items-start space-x-2.5 text-[15px] sm:text-base leading-relaxed text-slate-800 my-1 pl-0.5">
                  <span className="text-teal-600 font-bold text-base leading-none mt-1 shrink-0">•</span>
                  <div className="flex-1 min-w-0">{renderInline(cleanText)}</div>
                </div>
              );
            }
            // Regular paragraph line
            return (
              <p key={lIdx} className="text-[15px] sm:text-base leading-relaxed text-slate-800">
                {renderInline(line)}
              </p>
            );
          })}
        </div>
      );
    });
  };

  return (
    <div className="flex flex-col h-full w-full bg-white md:rounded-3xl md:border md:border-slate-200/90 md:shadow-xs overflow-hidden">
      
      {/* COMPACT AI HEADER (56-64px) */}
      <div className="px-4 py-2.5 sm:px-5 sm:py-3 border-b border-slate-200/90 bg-white/95 backdrop-blur-md flex items-center justify-between shrink-0 min-h-[56px] sm:min-h-[62px] pt-safe">
        <div className="flex items-center space-x-2.5 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className="w-8 h-8 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 flex items-center justify-center transition-colors touch-press shrink-0"
              title="Back to Overview"
              aria-label="Back to Overview"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
            <Bot className="w-4.5 h-4.5" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-sm sm:text-base text-slate-900 truncate">
                {actorType === 'patient' ? 'MediBrief AI' : 'Clinical AI Assistant'}
              </span>
              <span className="text-[10px] font-bold bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full border border-teal-200 flex items-center space-x-1 shrink-0">
                <ShieldCheck className="w-3 h-3 text-teal-600" />
                <span>RAG Verified</span>
              </span>
            </div>
            <p className="text-[11px] text-slate-500 truncate">
              Answers based on your medical records
            </p>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center space-x-1.5 shrink-0">
          {onGenerateSummary && (
            <button
              onClick={onGenerateSummary}
              className="min-h-[36px] px-2.5 sm:px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 text-indigo-700 border border-indigo-200 text-[11px] sm:text-xs font-bold rounded-xl flex items-center space-x-1 transition-colors touch-press shadow-2xs"
              title="Generate Clinical Summary"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span className="hidden xs:inline">Summary</span>
            </button>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => setHeaderMenuOpen(prev => !prev)}
              className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors touch-press"
              aria-label="Chat options"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {headerMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setHeaderMenuOpen(false)}
                />
                <div
                  className="absolute right-0 top-9 z-30 w-52 bg-white rounded-2xl shadow-xl border border-slate-200/90 py-1.5 animate-in fade-in zoom-in-95 duration-100"
                  onClick={e => e.stopPropagation()}
                >
                  {onGenerateSummary && (
                    <button
                      type="button"
                      onClick={() => {
                        setHeaderMenuOpen(false);
                        onGenerateSummary();
                      }}
                      className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center space-x-2 touch-press"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Generate Clinical Summary</span>
                    </button>
                  )}
                  <div className="h-px bg-slate-100 my-1" />
                  <button
                    type="button"
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      handleRestartChat();
                    }}
                    className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center space-x-2 touch-press"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                    <span>Clear Conversation</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* COMPACT MEDICAL DISCLAIMER (32-40px, dismissible) */}
      {showDisclaimer && (
        <div className="px-3.5 py-2 bg-amber-50/70 border-b border-amber-200/60 flex items-center justify-between text-[11px] text-amber-900 shrink-0">
          <div className="flex items-center space-x-1.5 min-w-0 pr-2">
            <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="truncate">AI helps you understand your records. It does not replace a doctor.</span>
          </div>
          <button
            type="button"
            onClick={() => setShowDisclaimer(false)}
            className="p-1 text-amber-600 hover:text-amber-800 touch-press shrink-0"
            aria-label="Dismiss disclaimer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* PRIMARY CHAT CONVERSATION AREA (60-70% of viewport) */}
      <div className="flex-1 p-3.5 sm:p-6 overflow-y-auto space-y-4 bg-slate-50/40 pb-44 md:pb-6">
        
        {/* Welcome Empty State Card */}
        {messages.length === 1 && messages[0].id === 'welcome' && (
          <div className="py-4 sm:py-6 text-center max-w-sm mx-auto space-y-2.5 animate-in fade-in duration-300">
            <div className="w-11 h-11 rounded-2xl bg-teal-50 text-teal-600 border border-teal-200/80 flex items-center justify-center mx-auto shadow-2xs">
              <Sparkles className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900">MediBrief AI</h3>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                Ask questions about your medical history, reports, medications, or lab results.
              </p>
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className="w-full">
            {msg.role === 'user' ? (
              /* User Chat Bubble: Right Aligned, Soft Teal Background, 16px Font */
              <div className="flex flex-col items-end pl-6 sm:pl-12">
                <div className="bg-teal-700 text-white rounded-2xl rounded-tr-xs px-4 py-3 sm:px-5 sm:py-3.5 max-w-[88%] sm:max-w-[78%] shadow-xs">
                  <p className="text-[15px] sm:text-base leading-relaxed font-medium whitespace-pre-wrap">
                    {msg.message}
                  </p>
                </div>
                <span className="text-[10px] font-semibold text-slate-400 mt-1 mr-1">You</span>
              </div>
            ) : (
              /* AI Chat Bubble: Left Aligned, Clean White Card, Structured Non-Markdown UI */
              <div className="flex items-start space-x-2.5 sm:space-x-3 pr-2 sm:pr-8">
                <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>

                <div className="flex-1 min-w-0 bg-white border border-slate-200/90 rounded-2xl rounded-tl-xs p-4 sm:p-5 shadow-2xs space-y-2.5">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div className="flex items-center space-x-1.5">
                      <span className="font-extrabold text-xs text-slate-900">MediBrief AI</span>
                      <span className="text-[10px] font-bold px-2 py-0.2 bg-teal-50 text-teal-700 border border-teal-200 rounded-full">
                        RAG Verified
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400">Clinical Digest</span>
                  </div>

                  {/* Formatted Message Content (16px, proper spacing, bold, bullets, metrics highlighted) */}
                  <div className="pt-0.5">
                    {renderFormattedMessage(msg.message)}
                  </div>

                  {/* Clickable Citations & Source Records */}
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                        <FileText className="w-3.5 h-3.5 text-teal-600" />
                        <span>Source Records ({msg.citations.length})</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.citations.map((cite, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              if (onViewRecordDetail) onViewRecordDetail(cite);
                              else if (onOpenRecord) onOpenRecord(cite.record_id);
                            }}
                            className="min-h-[40px] inline-flex items-center space-x-2 px-3 py-1.5 bg-teal-50 hover:bg-teal-100 active:bg-teal-200 text-teal-900 border border-teal-200/90 rounded-xl text-xs font-bold transition-all text-left touch-press group shadow-2xs"
                            title={`Open source report: ${cite.record_title}`}
                          >
                            <FileText className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                            <span className="truncate max-w-[170px] sm:max-w-[220px]">{cite.record_title}</span>
                            <span className="text-teal-600 text-[11px] font-medium shrink-0">({cite.record_date})</span>
                            <ExternalLink className="w-3 h-3 text-teal-500 group-hover:translate-x-0.5 transition-transform shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Disclaimer Note */}
                  {msg.disclaimer && (
                    <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-400 italic">
                      ℹ️ {msg.disclaimer}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Thinking Indicator */}
        {isLoading && (
          <div className="flex items-start space-x-2.5 sm:space-x-3 animate-in fade-in duration-200">
            <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
              <Sparkles className="w-4 h-4 animate-spin text-teal-200" />
            </div>
            <div className="bg-white border border-slate-200/90 rounded-2xl rounded-tl-xs p-4 shadow-2xs flex items-center space-x-3">
              <div className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-teal-600 animate-bounce [animation-delay:-0.3s]" />
                <span className="w-2 h-2 rounded-full bg-teal-600 animate-bounce [animation-delay:-0.15s]" />
                <span className="w-2 h-2 rounded-full bg-teal-600 animate-bounce" />
              </div>
              <span className="text-xs font-bold text-slate-700">
                Thinking & analyzing medical reports...
              </span>
            </div>
          </div>
        )}

        {/* Retry button on failed request */}
        {lastFailedQuery && !isLoading && (
          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => handleSend(lastFailedQuery)}
              className="min-h-[44px] inline-flex items-center space-x-1.5 px-4 py-2 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 text-xs font-bold rounded-xl border border-rose-200 touch-press shadow-2xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry: "{lastFailedQuery}"</span>
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* DESKTOP SUGGESTED QUESTIONS BAR (hidden on mobile, kept on desktop) */}
      <div className="hidden md:block px-4 py-2 bg-white/95 backdrop-blur-xs border-t border-slate-100 shrink-0">
        <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar py-0.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 pl-1">
            Suggested
          </span>
          {prompts.map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSend(p)}
              disabled={isLoading}
              className="min-h-[36px] px-3.5 py-1.5 bg-slate-50 hover:bg-teal-50 active:bg-teal-100 text-slate-700 hover:text-teal-900 border border-slate-200/90 hover:border-teal-300 rounded-full text-xs font-bold whitespace-nowrap transition-all touch-press shrink-0 shadow-2xs disabled:opacity-40"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* DESKTOP INPUT AREA (hidden on mobile, kept on desktop) */}
      <form
        onSubmit={e => { e.preventDefault(); handleSend(); }}
        className="hidden md:flex p-3 bg-white border-t border-slate-200/90 shrink-0 items-center gap-2 shadow-xs"
      >
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={
              actorType === 'patient'
                ? 'Ask about your medical records...'
                : 'Ask clinical questions about this patient...'
            }
            className="w-full min-h-[50px] text-base pl-4 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-2xs placeholder:text-slate-400"
            disabled={isLoading}
          />
        </div>
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          aria-label="Send message"
          className="min-h-[48px] min-w-[48px] px-3.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:opacity-40 text-white font-bold rounded-2xl flex items-center justify-center shadow-xs transition-colors touch-press shrink-0"
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-4 h-4 ml-0.5" />
          )}
        </button>
      </form>

      {/* MOBILE PERSISTENT FIXED BOTTOM COMPOSER DOCK (md:hidden) */}
      <div
        className="md:hidden fixed left-3 right-3 z-45 pointer-events-none transition-[bottom] duration-150 ease-out"
        style={{
          bottom: isKeyboardOpen
            ? `${keyboardHeight > 0 ? keyboardHeight + 8 : 8}px`
            : 'calc(3.75rem + env(safe-area-inset-bottom, 0px) + 8px)'
        }}
      >
        <div className="w-full space-y-2 pointer-events-auto">
          {/* Suggested Questions: hidden when virtual keyboard is open to maximize chat height */}
          {!isKeyboardOpen && (
            <div className="overflow-x-auto no-scrollbar py-0.5 -mx-1 px-1">
              <div className="flex items-center space-x-2 w-max">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider shrink-0 bg-white/90 backdrop-blur-md px-2 py-1 rounded-md border border-slate-200/80 shadow-2xs">
                  Suggested
                </span>
                {prompts.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSend(p)}
                    disabled={isLoading}
                    className="min-h-[36px] px-3.5 py-1 bg-white/95 hover:bg-teal-50 active:bg-teal-100 text-slate-700 hover:text-teal-900 border border-slate-200 hover:border-teal-300 rounded-full text-xs font-semibold whitespace-nowrap transition-all touch-press shrink-0 shadow-xs backdrop-blur-md disabled:opacity-40"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Mobile Persistent Chat Composer Box */}
          <form
            onSubmit={e => { e.preventDefault(); handleSend(); }}
            className="w-full min-h-[52px] h-[52px] sm:h-[56px] bg-white rounded-2xl border border-slate-300 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/20 shadow-lg px-2 sm:px-3 flex items-center gap-1.5 transition-all"
          >
            <input
              ref={mobileInputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onFocus={() => {
                setTimeout(() => {
                  scrollToBottom();
                }, 250);
              }}
              placeholder={
                actorType === 'patient'
                  ? 'Ask about your medical records...'
                  : 'Ask clinical questions...'
              }
              className="flex-1 min-w-0 h-full text-[15px] sm:text-base bg-transparent border-0 outline-none placeholder:text-slate-400 text-slate-800 px-1"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              aria-label="Send message"
              className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:opacity-30 disabled:pointer-events-none text-white flex items-center justify-center transition-all touch-press shrink-0 shadow-2xs"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-4 h-4 ml-0.5" />
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
