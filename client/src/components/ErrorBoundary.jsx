import { Component } from 'react';

/**
 * ErrorBoundary — catches unhandled render/lifecycle errors in any child tree.
 *
 * Placed around EmployeeDashboard and ManagerDashboard in App.jsx so that a
 * crash in one tab or component never produces a white screen with no message.
 *
 * Uses a class component because React error boundaries must be class-based.
 * getDerivedStateFromError + componentDidCatch is the standard pattern.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    // Update state to trigger the fallback UI on the next render
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Log to console so Railway / browser devtools capture it
    console.error('[ErrorBoundary] Unhandled render error:', error);
    console.error('[ErrorBoundary] Component stack:', info?.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        className="min-h-screen bg-gray-50 flex items-center justify-center p-6"
        dir="rtl"
      >
        <div className="bg-white rounded-2xl shadow-sm p-8 max-w-sm w-full text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-lg font-bold text-gray-800 mb-2">
            אירעה שגיאה בלתי צפויה
          </h2>
          <p className="text-sm text-gray-500 mb-6 leading-relaxed">
            אנא רענן את הדף. אם הבעיה חוזרת, פנה למנהל המערכת.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-indigo-600 text-white rounded-xl py-3 font-semibold text-sm hover:bg-indigo-700 transition-colors"
          >
            רענן דף
          </button>
        </div>
      </div>
    );
  }
}
