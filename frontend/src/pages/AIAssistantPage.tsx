import React from 'react';
import { AIChatbot } from '../components/AIChatbot';

interface AIAssistantPageProps {
  onOpenRecord: (recordId: string) => void;
  onGenerateSummary: () => void;
  onBackToDashboard?: () => void;
}

export const AIAssistantPage: React.FC<AIAssistantPageProps> = ({
  onOpenRecord,
  onGenerateSummary,
  onBackToDashboard
}) => {
  return (
    <div className="h-full flex flex-col min-h-0 flex-1">
      <AIChatbot
        actorType="patient"
        onOpenRecord={onOpenRecord}
        onBack={onBackToDashboard}
        onGenerateSummary={onGenerateSummary}
      />
    </div>
  );
};
