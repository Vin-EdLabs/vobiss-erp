import ReactMarkdown from 'react-markdown';
import { useNavigate } from 'react-router-dom';

interface VobiMessageProps {
  content: string;
  onNavigate?: () => void;
}

export function VobiMessage({ content, onNavigate }: VobiMessageProps) {
  const navigate = useNavigate();

  return (
    <div className="vobi-message-content">
      <ReactMarkdown
        components={{
          strong: ({ children }) => (
            <strong style={{ fontWeight: 600 }}>{children}</strong>
          ),
          em: ({ children }) => <em>{children}</em>,
          p: ({ children }) => (
            <p style={{ margin: '4px 0', lineHeight: 1.6 }}>{children}</p>
          ),
          ul: ({ children }) => (
            <ul
              style={{
                margin: '6px 0',
                paddingLeft: '16px',
                listStyle: 'none',
              }}
            >
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol
              style={{
                margin: '6px 0',
                paddingLeft: '20px',
              }}
            >
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li
              style={{
                margin: '4px 0',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                lineHeight: 1.5,
              }}
            >
              <span
                style={{
                  marginTop: '6px',
                  width: '5px',
                  height: '5px',
                  borderRadius: '50%',
                  background: 'currentColor',
                  opacity: 0.5,
                  flexShrink: 0,
                }}
              />
              <span>{children}</span>
            </li>
          ),
          a: ({ href, children }) => {
            const isInternal = Boolean(href && href.startsWith('/'));

            if (isInternal) {
              return (
                <button
                  type="button"
                  onClick={() => {
                    navigate(href!);
                    onNavigate?.();
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: 'var(--primary)',
                    textDecoration: 'none',
                    fontWeight: 500,
                    fontSize: '12px',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: 'var(--accent-green-light)',
                    border: '1px solid var(--primary)',
                    cursor: 'pointer',
                    marginLeft: '4px',
                    transition: 'all 150ms ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--primary)';
                    e.currentTarget.style.color = 'white';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--accent-green-light)';
                    e.currentTarget.style.color = 'var(--primary)';
                  }}
                >
                  {children} →
                </button>
              );
            }

            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: 'var(--primary)',
                  textDecoration: 'underline',
                }}
              >
                {children}
              </a>
            );
          },
          h1: ({ children }) => (
            <h1 style={{ fontSize: '15px', fontWeight: 600, margin: '8px 0 4px' }}>
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 style={{ fontSize: '14px', fontWeight: 600, margin: '8px 0 4px' }}>
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 style={{ fontSize: '13px', fontWeight: 600, margin: '6px 0 4px' }}>
              {children}
            </h3>
          ),
          code: ({ children }) => (
            <code
              style={{
                background: 'rgba(0,0,0,0.08)',
                padding: '1px 6px',
                borderRadius: '4px',
                fontSize: '12px',
                fontFamily: 'monospace',
              }}
            >
              {children}
            </code>
          ),
        }}
      >
        {content || ''}
      </ReactMarkdown>
    </div>
  );
}
