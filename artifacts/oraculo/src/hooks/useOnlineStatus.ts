import { useEffect, useState } from 'react';

function currentOnlineStatus(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(currentOnlineStatus);

  useEffect(() => {
    const update = () => setOnline(currentOnlineStatus());
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return online;
}
