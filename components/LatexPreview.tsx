
import React, { useEffect, useRef } from 'react';
import katex from 'katex';

interface LatexPreviewProps {
  content: string;
  className?: string;
}

const LatexPreview: React.FC<LatexPreviewProps> = ({ content, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      // Simple parser to handle mixed text and latex
      // Matches $...$ (inline) or $$...$$ (block)
      const renderText = (text: string) => {
        // This is a basic implementation. Ideally use a library like 'react-latex-next'
        // But for this demo we'll try to just render the whole block if it looks like math,
        // or split by delimiters manually.
        
        const fragments = text.split(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/g);
        
        containerRef.current!.innerHTML = '';
        
        fragments.forEach(fragment => {
          if (fragment.startsWith('$$') && fragment.endsWith('$$')) {
            const math = fragment.slice(2, -2);
            const span = document.createElement('div');
            try {
              katex.render(math, span, { displayMode: true, throwOnError: false });
            } catch (e) { span.innerText = fragment; }
            containerRef.current?.appendChild(span);
          } else if (fragment.startsWith('$') && fragment.endsWith('$')) {
            const math = fragment.slice(1, -1);
            const span = document.createElement('span');
            try {
              katex.render(math, span, { displayMode: false, throwOnError: false });
            } catch (e) { span.innerText = fragment; }
            containerRef.current?.appendChild(span);
          } else {
            const span = document.createElement('span');
            span.innerText = fragment;
            containerRef.current?.appendChild(span);
          }
        });
      };

      renderText(content || '');
    }
  }, [content]);

  return <div ref={containerRef} className={`text-sm text-gray-800 leading-relaxed ${className}`} />;
};

export default LatexPreview;
