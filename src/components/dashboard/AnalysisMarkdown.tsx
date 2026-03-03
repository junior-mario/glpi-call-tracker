import ReactMarkdown from "react-markdown";

interface AnalysisMarkdownProps {
  content: string;
}

export function AnalysisMarkdown({ content }: AnalysisMarkdownProps) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
