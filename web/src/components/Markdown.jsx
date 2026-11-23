import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { alignNumericColumns } from '../lib/tables.js';

// The report is written by a model from user data, so it is treated as untrusted:
// raw HTML is never rendered (react-markdown's default) and images are dropped.
const components = {
  img: () => null,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};

export default function Markdown({ children }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) alignNumericColumns(ref.current);
  }, [children]);
  return (
    <div className="prose" ref={ref}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
