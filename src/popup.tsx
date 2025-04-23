import React from 'react';
import { createRoot } from 'react-dom/client';
import './popup.css';

const App: React.FC = () => {
  const [count, setCount] = React.useState(0);

  React.useEffect(() => {
    chrome.storage.local.get(['count'], (result) => {
      if (typeof result.count === 'number') {
        setCount(result.count);
      }
    });
  }, []);

  const handleClick = () => {
    const newCount = count + 1;
    setCount(newCount);
    chrome.storage.local.set({ count: newCount });
  };

  return (
    <div style={{ padding: '16px', fontFamily: 'sans-serif' }}>
      <h1>Sample Extension</h1>
      <p>Count: {count}</p>
      <button onClick={handleClick}>Increment</button>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}