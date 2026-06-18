import { ToastProvider } from './context/ToastContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import NDIFlowEditor from './components/NDIFlowEditor';

function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <NDIFlowEditor />
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
