import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('UI error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh',
          backgroundColor: '#111827',
          color: '#fca5a5',
          padding: 24,
          fontFamily: 'Segoe UI, sans-serif',
        }}
        >
          <h1 style={{ color: '#fff', fontSize: 20 }}>NDI Manager UI error</h1>
          <p style={{ color: '#d1d5db', marginTop: 8 }}>
            Reload the page (Ctrl+F5). If it persists, report this message:
          </p>
          <pre style={{
            marginTop: 16,
            padding: 16,
            backgroundColor: '#1f2937',
            borderRadius: 8,
            overflow: 'auto',
            fontSize: 12,
            color: '#fecaca',
          }}
          >
            {this.state.error?.message || String(this.state.error)}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: 16,
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              backgroundColor: '#2563eb',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
