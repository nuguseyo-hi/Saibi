import { StrictMode, Component } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div className="error-screen"><h1>이야기를 불러오지 못했습니다.</h1><p>시나리오 데이터와 브라우저 콘솔을 확인해 주세요.</p></div> : this.props.children;
  }
}
const root = createRoot(document.getElementById('root')!);
// Dynamic loading also catches content validation errors raised at module load.
import('./prologue/PrologueApp').then(({ default: App }) => {
  root.render(<StrictMode><ErrorBoundary><App /></ErrorBoundary></StrictMode>);
}).catch((error: unknown) => {
  console.error(error);
  root.render(<div className="error-screen"><h1>시나리오를 불러오지 못했습니다.</h1><p>JSON 데이터의 구조와 참조 ID를 확인해 주세요.</p></div>);
});
